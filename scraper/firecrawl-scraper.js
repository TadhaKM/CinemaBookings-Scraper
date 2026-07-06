/**
 * Firecrawl-powered scraper for Odeon Ireland.
 *
 * Replaces the old Puppeteer/cheerio selector-guessing with Firecrawl's
 * structured extraction: we hand Firecrawl a URL + a JSON schema and an LLM
 * returns clean, structured data that is robust to markup changes.
 *
 * Docs: https://docs.firecrawl.dev/features/scrape  (v2 API)
 */

const FIRECRAWL_API_URL = 'https://api.firecrawl.dev/v2/scrape';
const ODEON_WEBSITE = 'https://www.odeoncinemas.ie';

const API_KEY = process.env.FIRECRAWL_API_KEY;

/**
 * Whether Firecrawl is configured. When false, callers fall back to mock data.
 */
function isConfigured() {
  return Boolean(API_KEY);
}

/**
 * Turn a movie/cinema name into a stable URL-friendly id.
 */
function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/**
 * Core Firecrawl call: scrape a URL and return the structured JSON payload.
 *
 * @param {string} url          Page to scrape
 * @param {object} schema       JSON Schema describing the desired output
 * @param {string} prompt       Natural-language guidance for the extractor
 * @param {object} [opts]       { waitFor, timeout }
 * @returns {Promise<object>}   The extracted object (matches `schema`)
 */
async function scrapeStructured(url, schema, prompt, opts = {}) {
  if (!API_KEY) {
    throw new Error('FIRECRAWL_API_KEY is not set');
  }

  const { waitFor = 4000, timeout = 90000 } = opts;

  const controller = new AbortController();
  const abortTimer = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(FIRECRAWL_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        url,
        onlyMainContent: false,
        waitFor,
        formats: [{ type: 'json', schema, prompt }]
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Firecrawl HTTP ${response.status}: ${body.slice(0, 300)}`);
    }

    const payload = await response.json();

    if (!payload.success) {
      throw new Error(`Firecrawl returned success=false: ${JSON.stringify(payload).slice(0, 300)}`);
    }

    return payload.data?.json || {};
  } finally {
    clearTimeout(abortTimer);
  }
}

/**
 * Scrape the list of Odeon Dublin cinemas.
 */
async function scrapeCinemas() {
  console.log('🔥 Firecrawl: scraping Odeon Dublin cinemas...');

  const schema = {
    type: 'object',
    properties: {
      cinemas: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Cinema name, e.g. "ODEON Point Square Dublin"' },
            url: { type: 'string', description: 'Absolute or relative link to the cinema page' },
            address: { type: 'string', description: 'Street address if shown' }
          },
          required: ['name']
        }
      }
    },
    required: ['cinemas']
  };

  const prompt =
    'Extract every Odeon cinema located in Dublin, Ireland from this page. ' +
    'Only include cinemas whose location is Dublin. For each, capture its display name, ' +
    'the link to its page, and its address if available.';

  const data = await scrapeStructured(`${ODEON_WEBSITE}/cinemas/`, schema, prompt);

  const cinemas = (data.cinemas || [])
    .filter((c) => c && c.name && /dublin/i.test(`${c.name} ${c.address || ''}`))
    .map((c) => {
      const slug = c.url ? c.url.split('/').filter(Boolean).pop() : slugify(c.name);
      return {
        id: slug || slugify(c.name),
        name: c.name.trim(),
        address: (c.address || '').trim()
      };
    });

  // Deduplicate by id
  const unique = [...new Map(cinemas.map((c) => [c.id, c])).values()];
  console.log(`🔥 Firecrawl: found ${unique.length} Dublin cinemas`);
  return unique;
}

/**
 * Scrape the movies (with showtimes) currently showing at a cinema.
 */
async function scrapeMovies(cinemaId) {
  console.log(`🔥 Firecrawl: scraping movies for cinema "${cinemaId}"...`);

  const schema = {
    type: 'object',
    properties: {
      movies: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Film title' },
            posterUrl: { type: 'string', description: 'URL of the film poster image' },
            certificate: { type: 'string', description: 'Age rating, e.g. "12A", "15", "PG"' },
            synopsis: { type: 'string', description: 'Short film synopsis if present' },
            releaseDate: { type: 'string', description: 'Release date if shown (ISO or human readable)' },
            showtimes: {
              type: 'array',
              description: 'All bookable screening times visible for this film',
              items: {
                type: 'object',
                properties: {
                  date: { type: 'string', description: 'Date of the screening, e.g. "Today", "Sat 12 Jul"' },
                  time: { type: 'string', description: 'Start time in HH:MM 24-hour format' },
                  format: { type: 'string', description: 'Screen format, e.g. "Standard", "IMAX", "3D", "Recliner"' }
                },
                required: ['time']
              }
            }
          },
          required: ['name']
        }
      }
    },
    required: ['movies']
  };

  const prompt =
    'Extract every film currently showing or bookable at this cinema. ' +
    'For each film include its title, poster image URL, age certificate, a short synopsis, ' +
    'release date, and ALL of its screening times with their date and format. ' +
    'If a film is listed but has no times shown, still include it with an empty showtimes list.';

  const url = `${ODEON_WEBSITE}/cinemas/${cinemaId}/`;
  const data = await scrapeStructured(url, schema, prompt, { waitFor: 6000 });

  const movies = (data.movies || [])
    .filter((m) => m && m.name && m.name.trim().length > 1)
    .map((m) => {
      const showtimes = (m.showtimes || [])
        .filter((s) => s && s.time)
        .map((s) => ({
          date: (s.date || 'Today').trim(),
          time: s.time.trim(),
          format: (s.format || 'Standard').trim()
        }));

      return {
        id: slugify(m.name),
        name: m.name.trim(),
        posterUrl: m.posterUrl || null,
        certificate: m.certificate || null,
        synopsis: m.synopsis || null,
        releaseDate: m.releaseDate || null,
        showtimes,
        showtimeCount: showtimes.length,
        available: true
      };
    });

  // Deduplicate by id (some films appear in multiple sections)
  const unique = [...new Map(movies.map((m) => [m.id, m])).values()];
  console.log(`🔥 Firecrawl: found ${unique.length} movies at "${cinemaId}"`);
  return unique;
}

/**
 * Turn a URL slug ("masters-of-the-universe") into a readable title.
 */
function humanizeSlug(slug) {
  return slug
    .split('-')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

const STATUS_PRIORITY = { 'pre-book': 3, 'coming-soon': 2, 'now-showing': 1 };

/**
 * Scrape ODEON's ALL Films page — the single source of truth for every film's
 * availability status (now showing / pre-book / coming soon), including titles
 * that aren't in any cinema's daily listings yet.
 *
 * We parse the page markdown deterministically rather than via LLM extraction
 * (which sometimes returned only the top carousel). Each film card carries its
 * status label inline — "Coming soon" / "Pre-book now" — and now-showing films
 * carry no label. Title, poster and certificate all come from the same card, so
 * one cached scrape covers everything the tracker needs.
 */
async function scrapeFilmIndex() {
  if (!API_KEY) throw new Error('FIRECRAWL_API_KEY is not set');
  console.log('🔥 Firecrawl: scraping ODEON ALL Films page...');

  const response = await fetch(FIRECRAWL_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({
      url: `${ODEON_WEBSITE}/films/`,
      onlyMainContent: true,
      waitFor: 6000,
      formats: ['markdown']
    })
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Firecrawl HTTP ${response.status}: ${body.slice(0, 200)}`);
  }

  const payload = await response.json();
  const md = payload.data?.markdown || '';

  const filmRe = /\/films\/([a-z0-9-]+)\/(HO\d+)\//i;
  const byId = new Map();

  // Each film is a markdown list item ("- [ ... ](film-url) ..."). Split on the
  // bullet so a card's status label can't bleed in from its neighbour.
  for (const card of md.split(/\n\s*-\s+\[/)) {
    const match = card.match(filmRe);
    if (!match) continue;
    const [, slug, filmId] = match;

    // Status label lives before the film URL inside the card.
    const before = card.slice(0, card.indexOf(match[0]));
    const status = /coming soon/i.test(before)
      ? 'coming-soon'
      : /pre.?book/i.test(before)
        ? 'pre-book'
        : 'now-showing';

    const nameFromAlt = card.match(/!\[([^\]]+?)\s+poster\]/i);
    const name = nameFromAlt ? nameFromAlt[1].trim() : humanizeSlug(slug);

    const poster = card.match(/\((https:\/\/film-cdn[^)]+?Poster[^)]*)\)/i);
    const cert = card.match(/!\[([^\]]+)\]\((?:https:\/\/vwc\.odeoncinemas\.ie)[^)]*RatingIconGraphic/i);

    const film = {
      id: slug,
      filmId,
      name,
      url: `${ODEON_WEBSITE}/films/${slug}/${filmId}/`,
      status,
      posterUrl: poster ? poster[1] : null,
      certificate: cert ? cert[1].trim() : null
    };

    // Dedupe across "Top Films"/"All Films"; keep the most specific status.
    const existing = byId.get(filmId);
    if (!existing || STATUS_PRIORITY[status] > STATUS_PRIORITY[existing.status]) {
      byId.set(filmId, { ...existing, ...film });
    } else if (existing && !existing.posterUrl && film.posterUrl) {
      existing.posterUrl = film.posterUrl;
    }
  }

  const films = [...byId.values()];
  console.log(`🔥 Firecrawl: ALL Films page → ${films.length} titles`);
  return films;
}

/**
 * Scrape a single film page for its availability status and metadata.
 * `status` is the label shown near the title: "Now showing" / "Pre-book now" / "Coming soon".
 */
async function scrapeFilm(url) {
  console.log(`🔥 Firecrawl: scraping film page ${url}`);

  const schema = {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Film title' },
      status: {
        type: 'string',
        description: 'The availability label shown near the title, exactly one of: "Now showing", "Pre-book now", "Coming soon"'
      },
      releaseDate: { type: 'string', description: 'Release date as shown, e.g. "29 July 2026"' },
      certificate: { type: 'string', description: 'Age rating / classification' },
      runtime: { type: 'string', description: 'Runtime, e.g. "2h 20m"' },
      synopsis: { type: 'string', description: 'Short synopsis' },
      posterUrl: { type: 'string', description: 'Poster image URL' }
    },
    required: ['name']
  };

  const prompt =
    'Extract this film\'s details. The "status" field MUST be the availability label shown ' +
    'near the title — one of "Now showing", "Pre-book now", or "Coming soon".';

  return scrapeStructured(url, schema, prompt, { waitFor: 6000 });
}

module.exports = {
  isConfigured,
  scrapeCinemas,
  scrapeMovies,
  scrapeFilmIndex,
  scrapeFilm
};
