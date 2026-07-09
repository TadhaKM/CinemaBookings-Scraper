/**
 * Movie release-schedule service.
 *
 * Source: https://www.the-numbers.com/movies/release-schedule/<year>
 * The page is static HTML with a table where each row's date comes from a
 * `<tr id="YYYY-MM-DD">` (rows without an id inherit the previous date) and the
 * title is a `<a href="/movie/...">Title</a>` link.
 *
 * We scrape the current + next year once a day and cache the result to
 * data/release-schedule.json so it's cheap to look up and easy to inspect.
 */

const fs = require('fs');
const path = require('path');
const Fuse = require('fuse.js');

const DATA_DIR = path.join(__dirname, '../data');
const CACHE_FILE = path.join(DATA_DIR, 'release-schedule.json');
const CACHE_TTL = 24 * 60 * 60 * 1000; // 1 day
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

let inflight = null;

const ENTITIES = { '&amp;': '&', '&quot;': '"', '&#39;': "'", '&apos;': "'", '&nbsp;': ' ' };

function decodeEntities(str) {
  return str
    .replace(/&amp;|&quot;|&#39;|&apos;|&nbsp;/g, (m) => ENTITIES[m])
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parse one year's release-schedule HTML into [{ title, date }].
 */
function parseSchedule(html) {
  const rows = html.match(/<tr[\s\S]*?<\/tr>/gi) || [];
  const releases = [];
  let currentDate = null;

  for (const row of rows) {
    const idMatch = row.match(/<tr[^>]*\bid="(\d{4}-\d{2}-\d{2})"/i);
    if (idMatch) currentDate = idMatch[1];

    const linkMatch = row.match(/<a href="\/movie\/[^"]*">([^<]+)<\/a>/i);
    if (linkMatch && currentDate) {
      const title = decodeEntities(linkMatch[1]);
      if (title) releases.push({ title, date: currentDate });
    }
  }
  return releases;
}

async function fetchYear(year) {
  const url = `https://www.the-numbers.com/movies/release-schedule/${year}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`the-numbers ${year} HTTP ${res.status}`);
  return parseSchedule(await res.text());
}

function loadCache() {
  try {
    if (fs.existsSync(CACHE_FILE)) return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
  } catch (e) {
    console.error('Error reading release-schedule cache:', e.message);
  }
  return null;
}

function saveCache(data) {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Error writing release-schedule cache:', e.message);
  }
}

/**
 * Refresh the schedule from the-numbers (current + next year) and cache it.
 */
async function refresh() {
  const year = new Date().getFullYear();
  const years = [year, year + 1];
  const merged = new Map(); // `${title}|${date}` -> {title,date}

  for (const y of years) {
    try {
      const list = await fetchYear(y);
      for (const r of list) merged.set(`${r.title}|${r.date}`, r);
      console.log(`📅 Release schedule: ${y} → ${list.length} entries`);
    } catch (e) {
      console.error(`⚠ Release schedule ${y} failed:`, e.message);
    }
  }

  const releases = [...merged.values()].sort((a, b) => a.date.localeCompare(b.date));
  const data = { updatedAt: new Date().toISOString(), years, count: releases.length, releases };
  saveCache(data);
  return data;
}

/**
 * Get the schedule, refreshing if the cache is missing or stale.
 */
async function getSchedule() {
  const cache = loadCache();
  if (cache && Date.now() - new Date(cache.updatedAt).getTime() < CACHE_TTL) {
    return cache;
  }
  if (inflight) return inflight;
  inflight = refresh().finally(() => (inflight = null));
  return inflight;
}

/**
 * Look up a film's release date by (fuzzy) title.
 * Returns { title, date, source: 'the-numbers' } or null.
 */
async function findReleaseDate(movieName) {
  const { releases } = await getSchedule();
  if (!releases || !releases.length) return null;

  const fuse = new Fuse(releases, {
    keys: ['title'],
    threshold: 0.3,
    ignoreLocation: true,
    includeScore: true,
    minMatchCharLength: 2
  });

  const results = fuse.search(movieName);
  if (!results.length || results[0].score > 0.4) return null;

  // Among the good matches, prefer the soonest upcoming date.
  const today = new Date().toISOString().slice(0, 10);
  const good = results.filter((r) => r.score <= 0.4).map((r) => r.item);
  const upcoming = good
    .filter((r) => r.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  const chosen = upcoming[0] || good.sort((a, b) => b.date.localeCompare(a.date))[0];

  return chosen ? { title: chosen.title, date: chosen.date, source: 'the-numbers' } : null;
}

module.exports = {
  refresh,
  getSchedule,
  findReleaseDate,
  parseSchedule // exported for testing
};
