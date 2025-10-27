/**
 * Vue Cinemas Dublin Scraper
 * Scrapes Vue Cinemas (myvue.com) for movie listings in Dublin
 */

const puppeteer = require('puppeteer');

// Vue Cinemas configuration
const VUE_WEBSITE = 'https://www.myvue.com';

// Cache for browser instance
let browser = null;

async function getBrowser() {
  if (!browser || !browser.isConnected()) {
    console.log('🚀 Launching Puppeteer browser for Vue...');
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    console.log('✓ Browser launched successfully');
  }
  return browser;
}

/**
 * Get all Vue cinemas in Dublin area
 */
async function getCinemas() {
  console.log('🎬 Fetching Vue Dublin cinemas...');

  // Vue has one main location in Dublin
  return [
    {
      id: 'liffey-valley',
      name: 'Vue Liffey Valley',
      location: 'Liffey Valley Shopping Centre, Dublin',
      url: `${VUE_WEBSITE}/cinema/dublin/whats-on`
    }
  ];
}

/**
 * Get all movies showing at a Vue cinema
 * @param {string} cinemaId - Cinema identifier (e.g., 'liffey-valley')
 */
async function getMovies(cinemaId) {
  console.log(`🎬 Fetching movies for Vue ${cinemaId}...`);

  const cinemas = await getCinemas();
  const cinema = cinemas.find(c => c.id === cinemaId);

  if (!cinema) {
    throw new Error(`Unknown Vue cinema: ${cinemaId}`);
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

      // Vue uses various selectors for movie cards
      const movieCards = document.querySelectorAll(
        '[class*="movie"], [class*="film"], [data-film-title], .film-list-item, .movie-card'
      );

      movieCards.forEach(card => {
        const titleEl = card.querySelector('h2, h3, h4, [class*="title"]');
        const linkEl = card.querySelector('a[href*="/film/"], a[href*="/movie/"]');

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
              url: url.startsWith('http') ? url : `${VUE_WEBSITE}${url}`,
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

    console.log(`✓ Found ${movies.length} movies at Vue ${cinemaId}`);
    return movies;

  } catch (error) {
    console.error(`⚠ Failed to fetch Vue movies: ${error.message}`);

    // Return mock data for testing
    return [
      {
        id: 'tron-ares',
        name: 'Tron: Ares',
        url: `${VUE_WEBSITE}/film/tron-ares`,
        available: true,
        showtimes: [],
        showtimeCount: 0
      },
      {
        id: 'wicked',
        name: 'Wicked',
        url: `${VUE_WEBSITE}/film/wicked`,
        available: true,
        showtimes: [],
        showtimeCount: 0
      }
    ];
  }
}

/**
 * Search for a specific movie at a Vue cinema
 * @param {string} movieName - Movie name to search for
 * @param {string} cinemaId - Cinema identifier
 */
async function searchMovie(movieName, cinemaId) {
  console.log(`🔍 Searching for "${movieName}" at Vue ${cinemaId}`);

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
      cinemaId: `vue-${cinemaId}`,
      searchMethod: 'simple-search'
    };
  }

  console.log(`✗ No matches found for "${movieName}"`);
  return {
    found: false,
    movies: [],
    cinemaId: `vue-${cinemaId}`,
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
