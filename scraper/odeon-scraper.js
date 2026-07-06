const Fuse = require('fuse.js');
const { getMockCinemas, getMockMovies } = require('./mock-data');
const firecrawl = require('./firecrawl-scraper');

// --- Caching ---------------------------------------------------------------
// Cinemas rarely change; movie listings change through the day. We cache only
// successful Firecrawl results (never the mock fallback) and dedupe concurrent
// scrapes of the same target so "check all cinemas" doesn't fan out into
// duplicate API calls.

const CINEMAS_TTL = 6 * 60 * 60 * 1000; // 6 hours
const MOVIES_TTL = 15 * 60 * 1000; // 15 minutes

let cinemasCache = null; // { data, ts }
let cinemasInflight = null; // Promise

const moviesCache = new Map(); // cinemaId -> { data, ts }
const moviesInflight = new Map(); // cinemaId -> Promise

/**
 * Fetch all Odeon cinemas in Dublin (cached).
 */
async function getCinemas() {
  if (cinemasCache && Date.now() - cinemasCache.ts < CINEMAS_TTL) {
    return cinemasCache.data;
  }
  if (cinemasInflight) return cinemasInflight;

  cinemasInflight = (async () => {
    console.log('🎬 Fetching Odeon Dublin cinemas...');

    if (firecrawl.isConfigured()) {
      try {
        const cinemas = await firecrawl.scrapeCinemas();
        if (cinemas && cinemas.length > 0) {
          cinemasCache = { data: cinemas, ts: Date.now() };
          return cinemas;
        }
        console.log('⚠ Firecrawl returned no cinemas, falling back to mock data');
      } catch (error) {
        console.error('⚠ Firecrawl cinema scrape failed:', error.message);
      }
    } else {
      console.log('ℹ FIRECRAWL_API_KEY not set — using mock cinema data');
    }

    return getMockCinemas();
  })().finally(() => {
    cinemasInflight = null;
  });

  return cinemasInflight;
}

/**
 * Fetch movies (with showtimes) for a specific cinema (cached).
 */
async function getMovies(cinemaId) {
  const cached = moviesCache.get(cinemaId);
  if (cached && Date.now() - cached.ts < MOVIES_TTL) {
    return cached.data;
  }
  if (moviesInflight.has(cinemaId)) return moviesInflight.get(cinemaId);

  const promise = (async () => {
    console.log(`🎬 Fetching movies for cinema: ${cinemaId}`);

    if (firecrawl.isConfigured()) {
      try {
        const movies = await firecrawl.scrapeMovies(cinemaId);
        if (movies && movies.length > 0) {
          moviesCache.set(cinemaId, { data: movies, ts: Date.now() });
          return movies;
        }
        console.log('⚠ Firecrawl returned no movies, falling back to mock data');
      } catch (error) {
        console.error('⚠ Firecrawl movie scrape failed:', error.message);
      }
    } else {
      console.log('ℹ FIRECRAWL_API_KEY not set — using mock movie data');
    }

    return getMockMovies(cinemaId);
  })().finally(() => {
    moviesInflight.delete(cinemaId);
  });

  moviesInflight.set(cinemaId, promise);
  return promise;
}

/**
 * Resolve a list of cinema ids from a request:
 *   all=true          -> every Dublin cinema
 *   ['a','b']         -> those ids
 *   'a'               -> [ 'a' ]
 * Returns an array of { id, name }.
 */
async function resolveCinemas({ all, cinemaIds, cinemaId } = {}) {
  const list = await getCinemas();
  const nameOf = (id) => list.find((c) => c.id === id)?.name || id;

  let ids = [];
  if (all) {
    ids = list.map((c) => c.id);
  } else if (Array.isArray(cinemaIds) && cinemaIds.length) {
    ids = cinemaIds;
  } else if (cinemaId) {
    ids = [cinemaId];
  }

  // Deduplicate, preserve order
  ids = [...new Set(ids)];
  return ids.map((id) => ({ id, name: nameOf(id) }));
}

/**
 * Search for a specific movie at a single cinema using fuzzy matching.
 */
async function searchMovie(movieName, cinemaId) {
  console.log(`🔍 Searching for "${movieName}" at cinema ${cinemaId}`);

  try {
    const movies = await getMovies(cinemaId);

    if (movies.length === 0) {
      return {
        found: false,
        movies: [],
        error: 'No movies found at this cinema. It may have no current showings.'
      };
    }

    const fuse = new Fuse(movies, {
      keys: ['name'],
      threshold: 0.4,
      includeScore: true,
      ignoreLocation: true,
      minMatchCharLength: 2
    });

    const results = fuse.search(movieName);

    if (results.length > 0) {
      const matches = results
        .filter((result) => result.score < 0.5)
        .map((result) => ({ ...result.item, matchScore: result.score }));

      if (matches.length > 0) {
        console.log(`✓ Found ${matches.length} fuzzy match(es) for "${movieName}" at ${cinemaId}`);
        return { found: true, movies: matches, cinemaId, searchMethod: 'fuzzy-matching' };
      }
    }

    // Fallback: simple substring matching
    const searchTerm = movieName.toLowerCase();
    const matches = movies.filter(
      (movie) =>
        movie.name.toLowerCase().includes(searchTerm) ||
        searchTerm.includes(movie.name.toLowerCase())
    );

    return {
      found: matches.length > 0,
      movies: matches,
      cinemaId,
      searchMethod: 'substring',
      availableMovies: movies.map((m) => m.name)
    };
  } catch (error) {
    console.error('⚠ Search failed:', error.message);
    return { found: false, movies: [], error: error.message };
  }
}

/**
 * Search a movie across several cinemas in parallel.
 * Returns one grouped result per cinema.
 */
async function searchMovieMulti(movieName, cinemas) {
  return Promise.all(
    cinemas.map(async ({ id, name }) => {
      const r = await searchMovie(movieName, id);
      return {
        cinemaId: id,
        cinemaName: name,
        found: r.found,
        movies: r.movies || [],
        error: r.error || null,
        availableMovies: r.availableMovies || []
      };
    })
  );
}

// --- Film-centric tracking (incl. coming-soon) -----------------------------

const FILM_INDEX_TTL = 60 * 60 * 1000; // 1 hour
let filmIndexCache = null; // { data, ts }
let filmIndexInflight = null;

/**
 * ODEON's full film index (now showing + pre-book + coming soon), cached.
 */
async function getFilmIndex() {
  if (filmIndexCache && Date.now() - filmIndexCache.ts < FILM_INDEX_TTL) {
    return filmIndexCache.data;
  }
  if (filmIndexInflight) return filmIndexInflight;

  filmIndexInflight = (async () => {
    if (firecrawl.isConfigured()) {
      try {
        const films = await firecrawl.scrapeFilmIndex();
        if (films && films.length > 0) {
          filmIndexCache = { data: films, ts: Date.now() };
          return films;
        }
      } catch (error) {
        console.error('⚠ Firecrawl film index scrape failed:', error.message);
      }
    }
    return [];
  })().finally(() => {
    filmIndexInflight = null;
  });

  return filmIndexInflight;
}

/**
 * Find a film in the ODEON index by (fuzzy) title.
 */
async function findFilm(movieName) {
  const index = await getFilmIndex();
  if (!index.length) return null;

  const fuse = new Fuse(index, {
    keys: ['name'],
    threshold: 0.4,
    includeScore: true,
    ignoreLocation: true,
    minMatchCharLength: 2
  });

  const results = fuse.search(movieName);
  if (results.length > 0 && results[0].score < 0.5) {
    return results[0].item;
  }

  const term = movieName.toLowerCase();
  return index.find((f) => f.name.toLowerCase().includes(term)) || null;
}

/**
 * Normalise the film-page status label into a stable key.
 */
function normalizeStatus(raw) {
  const s = String(raw || '').toLowerCase();
  if (/now showing/.test(s)) return 'now-showing';
  if (/pre.?book/.test(s)) return 'pre-book';
  if (/coming soon/.test(s)) return 'coming-soon';
  return 'coming-soon';
}

/**
 * Get showtimes for a film at a single cinema (from that cinema's listings).
 * Returns null if the film isn't currently listed there.
 */
async function getShowtimesAtCinema(movieName, cinemaId) {
  const movies = await getMovies(cinemaId);
  if (!movies.length) return null;

  const fuse = new Fuse(movies, {
    keys: ['name'],
    threshold: 0.4,
    ignoreLocation: true,
    minMatchCharLength: 2
  });
  const results = fuse.search(movieName);
  const match = results.length
    ? results[0].item
    : movies.find((m) => m.name.toLowerCase().includes(movieName.toLowerCase()));

  if (!match) return null;
  return {
    matchedName: match.name,
    showtimes: match.showtimes || [],
    showtimeCount: match.showtimeCount ?? (match.showtimes || []).length
  };
}

/**
 * Find every cinema currently showing a film, with its showtimes.
 */
async function getShowingsAllCinemas(movieName) {
  const cinemas = await getCinemas();
  const results = await Promise.all(
    cinemas.map(async (c) => {
      const st = await getShowtimesAtCinema(movieName, c.id);
      return st && st.showtimeCount > 0
        ? { cinemaId: c.id, cinemaName: c.name, showtimes: st.showtimes, showtimeCount: st.showtimeCount }
        : null;
    })
  );
  return results.filter(Boolean);
}

/**
 * Check a film's overall availability status from its ODEON page.
 * Returns { found (bookable), bookable, status, releaseDate, film }.
 */
async function checkFilm(movieName) {
  // Dev / no-key path: treat mock "now showing" films as bookable.
  if (!firecrawl.isConfigured()) {
    const cinemas = await getCinemas();
    const r = await searchMovie(movieName, cinemas[0]?.id);
    if (r.found && r.movies.length) {
      const m = r.movies[0];
      return {
        found: true,
        bookable: true,
        status: 'now-showing',
        releaseDate: m.releaseDate || null,
        film: {
          name: m.name,
          url: null,
          posterUrl: m.posterUrl || null,
          certificate: m.certificate || null,
          synopsis: m.synopsis || null
        }
      };
    }
    return { found: false, bookable: false, status: 'coming-soon', releaseDate: null, film: { name: movieName } };
  }

  const film = await findFilm(movieName);
  if (!film) {
    return { found: false, bookable: false, status: 'not-listed', releaseDate: null, film: null };
  }

  let details = {};
  try {
    details = await firecrawl.scrapeFilm(film.url);
  } catch (error) {
    console.error('⚠ Firecrawl film page scrape failed:', error.message);
  }

  const status = normalizeStatus(details.status);
  const bookable = status === 'now-showing' || status === 'pre-book';

  return {
    found: bookable,
    bookable,
    status,
    releaseDate: details.releaseDate || null,
    film: {
      name: film.name,
      url: film.url,
      posterUrl: details.posterUrl || film.posterUrl || null,
      certificate: details.certificate || null,
      synopsis: details.synopsis || null
    }
  };
}

/**
 * Detailed, film-centric search used by the UI's "Search now":
 * film status + release date + which of the requested cinemas have showtimes.
 */
async function checkFilmDetailed(movieName, targets = [], { all = false } = {}) {
  const base = await checkFilm(movieName);
  const out = {
    query: movieName,
    notListed: base.status === 'not-listed',
    status: base.status,
    bookable: base.bookable,
    releaseDate: base.releaseDate,
    film: base.film,
    showings: []
  };

  if (base.bookable) {
    const cinemas = all || targets.length === 0 ? await getCinemas() : targets;
    const showings = await Promise.all(
      cinemas.map(async (c) => {
        const st = await getShowtimesAtCinema(movieName, c.id);
        return st && st.showtimeCount > 0
          ? { cinemaId: c.id, cinemaName: c.name, showtimes: st.showtimes, showtimeCount: st.showtimeCount }
          : null;
      })
    );
    out.showings = showings.filter(Boolean);
  }

  return out;
}

module.exports = {
  getCinemas,
  getMovies,
  resolveCinemas,
  searchMovie,
  searchMovieMulti,
  findFilm,
  checkFilm,
  checkFilmDetailed,
  getShowtimesAtCinema,
  getShowingsAllCinemas
};
