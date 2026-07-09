const fs = require('fs');
const path = require('path');
const odeonScraper = require('../scraper/odeon-scraper');
const settings = require('./settings');
const store = require('./json-store');
const notifier = require('./notifier');

const DATA_DIR = path.join(__dirname, '../data');
const TRACKED_FILE = path.join(DATA_DIR, 'tracked-movies.json');
const NOTIFICATIONS_FILE = path.join(DATA_DIR, 'notifications.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

/**
 * Load tracked movies from file
 */
function loadTrackedMovies() {
  return store.readJson(TRACKED_FILE, []);
}

/**
 * Save tracked movies to file (atomic)
 */
function saveTrackedMovies(movies) {
  store.writeJson(TRACKED_FILE, movies);
}

/**
 * Load notifications from file
 */
function loadNotifications() {
  return store.readJson(NOTIFICATIONS_FILE, []);
}

/**
 * Save notifications to file (atomic)
 */
function saveNotifications(notifications) {
  store.writeJson(NOTIFICATIONS_FILE, notifications);
}

/**
 * Get all tracked movies
 */
function getTrackedMovies() {
  return loadTrackedMovies();
}

/**
 * Add a movie to track
 */
function addMovie(movieName, cinemaId, cinemaName, options = {}) {
  const movies = loadTrackedMovies();

  // Don't track the same film at the same cinema twice.
  const existing = movies.find(
    (m) => m.movieName.toLowerCase() === movieName.toLowerCase() && m.cinemaId === cinemaId
  );
  if (existing) return existing;

  const newMovie = {
    id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
    movieName: movieName,
    cinemaId: cinemaId,
    cinemaName: cinemaName || 'Unknown Cinema',
    addedAt: new Date().toISOString(),
    lastChecked: null,
    status: 'tracking', // 'tracking' | 'found'
    filmStatus: 'unknown', // 'now-showing' | 'pre-book' | 'coming-soon' | 'not-listed'
    releaseDate: options.releaseDate || null, // 'YYYY-MM-DD' expected theatrical release
    releaseDateSource: options.releaseDateSource || null, // 'manual' | 'the-numbers' | null
    // null = inherit the global default from settings
    leadDays: Number.isFinite(options.leadDays) ? options.leadDays : null,
    tiers: Array.isArray(options.tiers) && options.tiers.length ? options.tiers : null,
    nextCheckAt: null,
    posterUrl: null,
    showings: [],
    foundAt: null
  };

  movies.push(newMovie);
  saveTrackedMovies(movies);

  return newMovie;
}

/**
 * Remove a tracked movie
 */
function removeMovie(id) {
  let movies = loadTrackedMovies();
  movies = movies.filter(movie => movie.id !== id);
  saveTrackedMovies(movies);
}

/**
 * Get all notifications
 */
function getNotifications() {
  return loadNotifications();
}

/**
 * Add a notification
 */
function addNotification(movieName, cinemaName, details) {
  const notifications = loadNotifications();

  const statusVerb =
    details.status === 'pre-book' ? 'is now available to pre-book' : 'is now showing';
  const where =
    cinemaName && cinemaName !== 'Any ODEON Dublin cinema' ? ` at ${cinemaName}` : ' at ODEON Dublin';

  const notification = {
    id: Date.now().toString(),
    movieName: movieName,
    cinemaName: cinemaName,
    message: `${movieName} ${statusVerb}${where}!`,
    details: details,
    createdAt: new Date().toISOString(),
    read: false
  };

  notifications.push(notification);
  saveNotifications(notifications);

  console.log(`🎬 NOTIFICATION: ${notification.message}`);

  // Fan out to email / push / SMS. Fire-and-forget: an outbound failure must
  // never break the availability check loop (notifier already swallows errors).
  notifier
    .send(notification)
    .catch((err) => console.error('⚠ Notification dispatch failed:', err.message));

  return notification;
}

/**
 * Clear all notifications
 */
function clearNotifications() {
  saveNotifications([]);
}

/**
 * Check all tracked movies for availability
 */
// --- Release-aware scheduling ----------------------------------------------
// The cadence tiers, lead window and unknown-date interval are user-configurable
// in data/settings.json (see services/settings.js). Defaults:
//   > leadDays away        → not checked yet (outside the window)
//   8–10 days              → every 3 hours
//   6–7 days               → every 2 hours
//   ≤ 5 days (incl. past)  → every 1 hour
//   unknown release date   → every 3 hours

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const rel = new Date(`${dateStr}T00:00:00`);
  if (isNaN(rel)) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((rel - today) / 86400000);
}

/** Per-film overrides layered on top of the global settings. */
function overridesFor(movie) {
  return {
    leadDays: Number.isFinite(movie.leadDays) ? movie.leadDays : undefined,
    tiers: Array.isArray(movie.tiers) && movie.tiers.length ? movie.tiers : undefined
  };
}

/** Minutes between checks for a movie, or null if it's outside its lead window. */
function intervalMinutes(movie) {
  return settings.intervalMinutesFor(daysUntil(movie.releaseDate), overridesFor(movie));
}

function computeNextCheck(movie) {
  if (movie.status === 'found') return null;
  const iv = intervalMinutes(movie);
  if (iv === null) {
    // Window not open yet: next check is when it opens (release − leadDays).
    if (movie.releaseDate) {
      const open = new Date(`${movie.releaseDate}T00:00:00`);
      open.setDate(open.getDate() - settings.effectiveLeadDays(overridesFor(movie)));
      return open.toISOString();
    }
    return null;
  }
  return new Date(Date.now() + iv * 60000).toISOString();
}

/**
 * Recompute every tracked film's nextCheckAt (e.g. after settings change).
 */
function recomputeSchedules() {
  const movies = loadTrackedMovies();
  for (const movie of movies) movie.nextCheckAt = computeNextCheck(movie);
  saveTrackedMovies(movies);
  return movies;
}

function isDue(movie, now) {
  if (movie.status === 'found') return false;
  const iv = intervalMinutes(movie);
  if (iv === null) return false; // outside lead window
  if (!movie.lastChecked) return true;
  return now - new Date(movie.lastChecked).getTime() >= iv * 60000 - 30000; // 30s slack
}

/**
 * Run the availability check for a single tracked movie and update it in place.
 */
async function checkMovie(movie) {
  try {
    const anyCinema = movie.cinemaId === 'all';
    console.log(`Checking: ${movie.movieName} (${anyCinema ? 'any cinema' : movie.cinemaId})`);

    const result = await odeonScraper.checkFilm(movie.movieName);

    movie.lastChecked = new Date().toISOString();
    movie.filmStatus = result.status;
    if (result.film && result.film.posterUrl) movie.posterUrl = result.film.posterUrl;

    let showings = [];
    let bookableHere = false;

    if (result.bookable) {
      if (anyCinema) {
        bookableHere = true;
        showings = await odeonScraper.getShowingsAllCinemas(movie.movieName);
      } else {
        const st = await odeonScraper.getShowtimesAtCinema(movie.movieName, movie.cinemaId);
        if (st && st.showtimeCount > 0) {
          showings = [
            {
              cinemaId: movie.cinemaId,
              cinemaName: movie.cinemaName,
              showtimes: st.showtimes,
              showtimeCount: st.showtimeCount
            }
          ];
          bookableHere = true;
        } else if (result.status === 'pre-book') {
          bookableHere = true;
        }
      }
    }

    movie.showings = showings;

    if (bookableHere) {
      if (movie.status !== 'found') {
        movie.status = 'found';
        movie.foundAt = new Date().toISOString();
        addNotification(movie.movieName, movie.cinemaName, {
          status: result.status,
          releaseDate: movie.releaseDate,
          showings,
          filmUrl: result.film?.url || null,
          posterUrl: result.film?.posterUrl || null
        });
      }
      console.log(`✓ Bookable: ${movie.movieName} [${result.status}] — ${showings.length} cinema(s) with times`);
    } else {
      if (movie.status !== 'found') movie.status = 'tracking';
      console.log(`… Not bookable yet: ${movie.movieName} [${result.status}]`);
    }
  } catch (error) {
    console.error(`Error checking movie ${movie.movieName}:`, error.message);
  } finally {
    movie.nextCheckAt = computeNextCheck(movie);
  }
}

/**
 * Persist the results of a check run without clobbering concurrent edits.
 *
 * A check can take minutes (scraping). If the user adds or removes a film in
 * that window, blind-writing the array we loaded at the start would resurrect
 * deleted films and drop newly added ones. So we re-read the current list and
 * merge our updates in by id, touching only films that still exist.
 */
function mergeCheckedMovies(checked) {
  const byId = new Map(checked.map((m) => [m.id, m]));
  const current = loadTrackedMovies();
  const merged = current.map((m) => (byId.has(m.id) ? { ...m, ...byId.get(m.id) } : m));
  saveTrackedMovies(merged);
}

/**
 * Checks are expensive (each bookable film scrapes every cinema for showtimes),
 * so runs are serialized: the cron tick, the post-track check and the manual
 * "Check all" can all fire at once, and we must not scrape in parallel or pile
 * up. Chaining (rather than dropping) means nothing is silently skipped.
 */
let checkChain = Promise.resolve();
function serialize(fn) {
  checkChain = checkChain.then(fn, fn);
  return checkChain;
}

/**
 * Check every tracked movie that hasn't been found yet.
 *
 * Films already marked `found` are skipped: their alert has fired, so
 * re-checking them only burns 5 cinema scrapes per run for no new information.
 */
async function checkTrackedMovies() {
  return serialize(async () => {
    const all = loadTrackedMovies();
    const movies = all.filter((m) => m.status !== 'found');
    const skipped = all.length - movies.length;

    if (!movies.length) {
      console.log(`Nothing to check (${skipped} already found).`);
      return;
    }

    console.log(
      `Checking ${movies.length} tracked movie(s)${skipped ? ` — skipping ${skipped} already found` : ''}...`
    );
    for (const movie of movies) await checkMovie(movie);
    mergeCheckedMovies(movies);
    console.log('Check completed!');
  });
}

/**
 * Scheduler tick: only check movies that are due per their release-aware cadence.
 * (isDue() already excludes films that have been found.)
 */
async function checkDueMovies() {
  return serialize(async () => {
    const movies = loadTrackedMovies();
    const now = Date.now();
    const due = movies.filter((m) => isDue(m, now));
    if (!due.length) return;
    console.log(`⏰ ${due.length} movie(s) due for a check`);
    for (const movie of due) await checkMovie(movie);
    mergeCheckedMovies(due);
  });
}

module.exports = {
  getTrackedMovies,
  addMovie,
  removeMovie,
  getNotifications,
  clearNotifications,
  checkTrackedMovies,
  checkDueMovies,
  recomputeSchedules,
  // exported for testing
  intervalMinutes,
  daysUntil,
  isDue
};
