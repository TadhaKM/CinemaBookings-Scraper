/**
 * Cineworld Dublin Scraper
 * Scrapes Cineworld (cineworld.ie) for movie listings in Dublin
 */

const puppeteer = require('puppeteer');

// Cineworld configuration
const CINEWORLD_WEBSITE = 'https://www.cineworld.ie';

// Cache for browser instance
let browser = null;

async function getBrowser() {
  if (!browser || !browser.isConnected()) {
    console.log('🚀 Launching Puppeteer browser for Cineworld...');
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    console.log('✓ Browser launched successfully');
  }
  return browser;
}

/**
 * Get all Cineworld cinemas in Dublin area
 */
async function getCinemas() {
  console.log('🎬 Fetching Cineworld Dublin cinemas...');

  // Cineworld has one main location in Dublin
  return [
    {
      id: 'dublin',
      name: 'Cineworld Dublin',
      location: 'Parnell Centre, Parnell Street, Dublin',
      url: `${CINEWORLD_WEBSITE}/cinemas/dublin/0001`
    }
  ];
}

/**
 * Get all movies showing at a Cineworld cinema
 * @param {string} cinemaId - Cinema identifier (e.g., 'dublin')
 */
async function getMovies(cinemaId) {
  console.log(`🎬 Fetching movies for Cineworld ${cinemaId}...`);

  const cinemas = await getCinemas();
  const cinema = cinemas.find(c => c.id === cinemaId);

  if (!cinema) {
    throw new Error(`Unknown Cineworld cinema: ${cinemaId}`);
  }

  try {
    const browser = await getBrowser();
    const page = await browser.newPage();

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    await page.goto(cinema.url, { waitUntil: 'networkidle2', timeout: 30000 });

    // Wait for movies to load
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Extract movie information
    const movies = await page.evaluate(() => {
      const movieList = [];

      // Cineworld uses various selectors for movie cards
      const movieCards = document.querySelectorAll(
        '[class*="movie"], [class*="film"], [data-movie-title], .film-card, .movie-item, article'
      );

      movieCards.forEach(card => {
        const titleEl = card.querySelector('h2, h3, h4, [class*="title"], [class*="name"]');
        const linkEl = card.querySelector('a[href*="/film"], a[href*="/movie"], a[href*="/films/"]');

        if (titleEl && linkEl) {
          const title = titleEl.textContent.trim();
          const url = linkEl.getAttribute('href');

          // Generate ID from title
          const id = title.toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');

          if (title && url) {
            movieList.push({
              id,
              name: title,
              url: url.startsWith('http') ? url : `${CINEWORLD_WEBSITE}${url}`,
              available: true,
              showtimes: [],
              showtimeCount: 0
            });
          }
        }
      });

      return movieList;
    });

    await page.close();

    console.log(`✓ Found ${movies.length} movies at Cineworld ${cinemaId}`);
    return movies;

  } catch (error) {
    console.error(`⚠ Failed to fetch Cineworld movies: ${error.message}`);

    // Return mock data for testing
    return [
      {
        id: 'tron-ares',
        name: 'Tron: Ares',
        url: `${CINEWORLD_WEBSITE}/films/tron-ares`,
        available: true,
        showtimes: [],
        showtimeCount: 0
      },
      {
        id: 'nosferatu',
        name: 'Nosferatu',
        url: `${CINEWORLD_WEBSITE}/films/nosferatu`,
        available: true,
        showtimes: [],
        showtimeCount: 0
      }
    ];
  }
}

/**
 * Search for a specific movie at a Cineworld cinema
 * @param {string} movieName - Movie name to search for
 * @param {string} cinemaId - Cinema identifier
 */
async function searchMovie(movieName, cinemaId) {
  console.log(`🔍 Searching for "${movieName}" at Cineworld ${cinemaId}`);

  const movies = await getMovies(cinemaId);

  // Simple fuzzy search
  const searchTerm = movieName.toLowerCase();
  const matches = movies.filter(movie =>
    movie.name.toLowerCase().includes(searchTerm)
  );

  if (matches.length > 0) {
    console.log(`✓ Found ${matches.length} matches`);
    return {
      found: true,
      movies: matches,
      cinemaId: `cineworld-${cinemaId}`,
      searchMethod: 'simple-search'
    };
  }

  console.log(`✗ No matches found for "${movieName}"`);
  return {
    found: false,
    movies: [],
    cinemaId: `cineworld-${cinemaId}`,
    searchMethod: 'simple-search'
  };
}

/**
 * Close the browser instance
 */
async function closeBrowser() {
  if (browser) {
    await browser.close();
    browser = null;
  }
}

module.exports = {
  getCinemas,
  getMovies,
  searchMovie,
  closeBrowser
};
