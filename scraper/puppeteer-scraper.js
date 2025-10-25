const puppeteer = require('puppeteer');

// Cache browser instance to avoid reopening
let browser = null;

/**
 * Get or create browser instance
 */
async function getBrowser() {
  if (!browser || !browser.isConnected()) {
    console.log('🚀 Launching Puppeteer browser...');
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu'
      ]
    });
    console.log('✓ Browser launched successfully');
  }
  return browser;
}

/**
 * Scrape Odeon cinemas using Puppeteer
 */
async function scrapeCinemas() {
  console.log('🎬 Scraping Odeon cinemas with Puppeteer...');

  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    console.log('   Loading: https://www.odeoncinemas.ie/cinemas/');
    await page.goto('https://www.odeoncinemas.ie/cinemas/', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    console.log('   Extracting cinema data from page...');

    // Extract cinema data from the page
    const cinemas = await page.evaluate(() => {
      const results = [];

      // Try multiple selectors
      const selectors = [
        'a[href*="/cinemas/"]',
        '.cinema-item',
        '[data-cinema]',
        'article[data-cinema-id]'
      ];

      for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);

        elements.forEach(el => {
          const href = el.getAttribute('href');
          const name = el.textContent?.trim() || el.getAttribute('title') || el.getAttribute('aria-label');

          if (href && name && name.toLowerCase().includes('dublin')) {
            const id = href.split('/').filter(Boolean).pop();

            if (id && id !== 'cinemas' && name.length < 100) {
              results.push({
                id: id,
                name: name,
                address: '' // Can be extracted if needed
              });
            }
          }
        });

        if (results.length > 0) break;
      }

      return results;
    });

    // Remove duplicates
    const uniqueCinemas = [...new Map(cinemas.map(c => [c.id, c])).values()];

    console.log(`✓ Found ${uniqueCinemas.length} Dublin cinemas`);
    uniqueCinemas.forEach(c => console.log(`   - ${c.name}`));

    await page.close();
    return uniqueCinemas;

  } catch (error) {
    console.error('⚠ Puppeteer cinema scraping failed:', error.message);
    await page.close();
    throw error;
  }
}

/**
 * Try to fetch showtimes from Odeon API directly
 */
async function tryOdeonAPI(cinemaId, filmId) {
  const axios = require('axios');

  // Common API patterns to try
  const apiPatterns = [
    `https://www.odeoncinemas.ie/api/v1/cinemas/${cinemaId}/films/${filmId}/sessions`,
    `https://www.odeoncinemas.ie/api/v1/sessions?cinema=${cinemaId}&film=${filmId}`,
    `https://www.odeoncinemas.ie/api/sessions/${cinemaId}/${filmId}`,
    `https://www.odeoncinemas.ie/api/showtimes?cinema=${cinemaId}&film=${filmId}`,
    `https://api.odeoncinemas.ie/v1/sessions?cinema=${cinemaId}&film=${filmId}`,
  ];

  for (const url of apiPatterns) {
    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
          'Referer': 'https://www.odeoncinemas.ie/'
        },
        timeout: 5000
      });

      if (response.data && response.status === 200) {
        console.log(`   ✅ Found API endpoint: ${url}`);
        return response.data;
      }
    } catch (e) {
      // API endpoint doesn't exist, try next
    }
  }

  return null;
}

/**
 * Scrape movies for a specific cinema using Puppeteer
 */
async function scrapeMovies(cinemaId) {
  console.log(`🎬 Scraping movies for ${cinemaId} with Puppeteer...`);

  const browser = await getBrowser();
  const page = await browser.newPage();

  // Intercept network requests to capture API calls
  const apiResponses = [];
  const requestUrls = [];

  await page.on('request', (request) => {
    const url = request.url();
    // Track all requests to find API patterns
    if (url.includes('/api/') || url.includes('showtime') || url.includes('session') || url.includes('performance') || url.includes('film')) {
      requestUrls.push(url);
    }
  });

  await page.on('response', async (response) => {
    const url = response.url();

    // Capture API responses that might contain movie or showtime data
    if (url.includes('/api/') || url.includes('showtime') || url.includes('session') || url.includes('performance')) {
      try {
        const contentType = response.headers()['content-type'] || '';
        if (contentType.includes('application/json')) {
          const data = await response.json();
          apiResponses.push({
            url: url,
            data: data,
            status: response.status()
          });
          console.log(`   📡 Captured API response: ${url} (${response.status()})`);
        }
      } catch (e) {
        // Not JSON or already consumed
      }
    }
  });

  try {
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Collect movies from multiple pages (now showing + coming soon)
    // Try multiple URL variations since some may 404
    const pagesToCheck = [
      { url: `https://www.odeoncinemas.ie/cinemas/${cinemaId}/`, name: 'Main page' },
      { url: `https://www.odeoncinemas.ie/cinemas/${cinemaId}/films/`, name: 'Films' },
      { url: `https://www.odeoncinemas.ie/films/?cinema=${cinemaId}`, name: 'Films Filter' }
    ];

    const allMovies = new Map(); // Use map to deduplicate by URL

    for (const pageInfo of pagesToCheck) {
      try {
        console.log(`   Loading ${pageInfo.name}: ${pageInfo.url}`);
        await page.goto(pageInfo.url, {
          waitUntil: 'networkidle2',
          timeout: 30000
        });

        // Wait longer for dynamic content and JavaScript
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Check if page is a 404 error
        const pageTitle = await page.title();
        const pageText = await page.evaluate(() => document.body.textContent);

        if (pageTitle.toLowerCase().includes('404') ||
            pageTitle.toLowerCase().includes('not found') ||
            pageText.toLowerCase().includes('page you are looking for has lost the plot') ||
            pageText.toLowerCase().includes('page not found')) {
          console.log(`   ⚠ ${pageInfo.name} returned 404 error, skipping...`);
          continue;
        }

        // Scroll to trigger lazy loading and click "Load More" buttons
        await page.evaluate(() => {
          window.scrollTo(0, document.body.scrollHeight);
        });
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Try to click "Load More", "Show More", "View All" buttons
        try {
          const loadMoreClicked = await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button, a'));
            const loadMoreBtn = buttons.find(btn => {
              const text = btn.textContent.toLowerCase();
              return text.includes('load more') ||
                     text.includes('show more') ||
                     text.includes('view all') ||
                     text.includes('see all') ||
                     text.includes('coming soon');
            });

            if (loadMoreBtn && loadMoreBtn.tagName === 'BUTTON') {
              loadMoreBtn.click();
              return true;
            } else if (loadMoreBtn && loadMoreBtn.tagName === 'A') {
              // Return the href instead of clicking
              return loadMoreBtn.getAttribute('href');
            }
            return false;
          });

          if (loadMoreClicked === true) {
            console.log(`      🔘 Clicked "Load More" button`);
            await new Promise(resolve => setTimeout(resolve, 3000));
          } else if (typeof loadMoreClicked === 'string') {
            console.log(`      🔗 Found link: ${loadMoreClicked}`);
          }
        } catch (e) {
          // No load more button, that's fine
        }

        // Scroll again to load any newly added content
        await page.evaluate(() => {
          window.scrollTo(0, document.body.scrollHeight);
        });
        await new Promise(resolve => setTimeout(resolve, 2000));

        await page.evaluate(() => {
          window.scrollTo(0, 0);
        });
        await new Promise(resolve => setTimeout(resolve, 1000));

        // DEBUG: Screenshot
        try {
          await page.screenshot({ path: `debug-${pageInfo.name.replace(/\s+/g, '-')}.png`, fullPage: true });
          console.log(`   📸 Screenshot: debug-${pageInfo.name.replace(/\s+/g, '-')}.png`);
        } catch (e) {}

        // DEBUG: Check page content and save HTML
        const pageHTML = await page.content();
        console.log(`   📄 Page loaded, extracting movies...`);

        // Save HTML for analysis
        try {
          const fs = require('fs');
          fs.writeFileSync(`debug-${pageInfo.name.replace(/\s+/g, '-')}.html`, pageHTML);
          console.log(`   💾 HTML saved: debug-${pageInfo.name.replace(/\s+/g, '-')}.html`);
        } catch (e) {}

        // Extract movie data from the page using MULTIPLE strategies
        const pageMovies = await page.evaluate(() => {
          const results = [];
          const debugInfo = {
            selectors: {}
          };

          // Strategy 1: Links with /films/ in href
          const filmLinks = document.querySelectorAll('a[href*="/films/"]');
          debugInfo.selectors['a[href*="/films/"]'] = filmLinks.length;

          // Strategy 2: ANY link with movie-like class names
          const movieElements = document.querySelectorAll('[class*="film"], [class*="movie"], [data-film], article');
          debugInfo.selectors['movie elements'] = movieElements.length;

          // Strategy 3: Try common movie grid/list patterns
          const gridItems = document.querySelectorAll('.grid-item, .movie-card, .film-card, .card');
          debugInfo.selectors['grid items'] = gridItems.length;

          // Combine all potential movie elements
          const allElements = new Set([...filmLinks, ...movieElements, ...gridItems]);
          debugInfo.combinedCount = allElements.size;

          allElements.forEach((elem) => {
            // Try to find a link within or use the element itself
            const link = elem.tagName === 'A' ? elem : elem.querySelector('a[href*="/films/"]');

            if (!link) return;

            const href = link.getAttribute('href');
            if (!href || !href.includes('/films/')) return;

            // Try multiple ways to get the movie name
            const name = link.getAttribute('title') ||
                        link.getAttribute('aria-label') ||
                        elem.querySelector('h1, h2, h3, h4, .title, [class*="title"]')?.textContent?.trim() ||
                        link.textContent?.trim();

            if (name && name.length > 2 && name.length < 200) {
              const id = href.split('/').filter(Boolean).pop() || `film-${results.length}`;

              // Skip generic links
              if (name.toLowerCase() === 'films' || name.toLowerCase() === 'movies' || name.toLowerCase() === 'view all') {
                return;
              }

              const fullUrl = href.startsWith('http') ? href : `https://www.odeoncinemas.ie${href}`;

              results.push({
                id: id,
                name: name,
                url: fullUrl,
                available: true,
                showtimes: [],
                releaseDate: null
              });
            }
          });

          // Deduplicate by URL within this page
          const seen = new Map();
          results.forEach(m => seen.set(m.url, m));

          debugInfo.resultsFound = results.length;

          return {
            movies: Array.from(seen.values()),
            debug: debugInfo
          };
        });

        const pageMoviesData = pageMovies.movies || pageMovies;
        const debugData = pageMovies.debug || {};

        console.log(`   🔍 Found ${pageMoviesData.length} movie links on ${pageInfo.name}`);
        if (debugData.selectors) {
          console.log(`      Debug - Selectors matched:`, JSON.stringify(debugData.selectors));
        }
        if (pageMoviesData.length > 0) {
          console.log(`      Movies: ${pageMoviesData.slice(0, 5).map(m => m.name).join(', ')}${pageMoviesData.length > 5 ? '...' : ''}`);
        }

        // Add to combined list (deduplicates by URL)
        pageMoviesData.forEach(movie => {
          allMovies.set(movie.url, movie);
        });

      } catch (error) {
        console.log(`   ⚠ Failed to load ${pageInfo.name}:`, error.message);
        console.log(`   Full error:`, error.stack);
        // Try to take screenshot even on error
        try {
          await page.screenshot({ path: `error-${pageInfo.name.replace(/\s+/g, '-')}.png` });
          console.log(`   📸 Error screenshot: error-${pageInfo.name.replace(/\s+/g, '-')}.png`);
        } catch (e) {}
        continue;
      }
    }

    const movieList = Array.from(allMovies.values());

    if (movieList.length === 0) {
      console.log('⚠ No movie links found on any page');
      await page.close();
      return [];
    }

    console.log(`✓ Found ${movieList.length} total unique movies`);

    // Return movies WITHOUT showtimes for now (much faster!)
    // Showtimes will be fetched only for searched movie
    const moviesWithoutShowtimes = movieList.map(movie => ({
      id: movie.id,
      name: movie.name,
      url: movie.url,
      available: true,
      showtimes: [], // Empty for now
      showtimeCount: 0,
      releaseDate: null
    }));

    await page.close();
    return moviesWithoutShowtimes;
  } catch (error) {
    console.error('⚠ Puppeteer movie scraping failed:', error.message);
    await page.close();
    throw error;
  }
}

/**
 * Close the browser when shutting down
 */
async function closeBrowser() {
  if (browser) {
    console.log('Closing Puppeteer browser...');
    await browser.close();
    browser = null;
  }
}

// Cleanup on process exit
process.on('SIGINT', async () => {
  await closeBrowser();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await closeBrowser();
  process.exit(0);
});

module.exports = {
  scrapeCinemas,
  scrapeMovies,
  closeBrowser
};
