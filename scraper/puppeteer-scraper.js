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
 * Scrape movies for a specific cinema using Puppeteer
 */
async function scrapeMovies(cinemaId) {
  console.log(`🎬 Scraping movies for ${cinemaId} with Puppeteer...`);

  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Try multiple URL patterns
    const urls = [
      `https://www.odeoncinemas.ie/cinemas/${cinemaId}/`,
      `https://www.odeoncinemas.ie/cinemas/${cinemaId}/whats-on/`,
      `https://www.odeoncinemas.ie/${cinemaId}/`
    ];

    let movies = [];

    for (const url of urls) {
      try {
        console.log(`   Loading: ${url}`);
        await page.goto(url, {
          waitUntil: 'networkidle2',
          timeout: 30000
        });

        // Wait a bit for dynamic content
        await new Promise(resolve => setTimeout(resolve, 2000));

        console.log('   Extracting movie data from page...');

        // DEBUG: Take screenshot
        try {
          await page.screenshot({ path: `debug-${cinemaId}.png` });
          console.log(`   📸 Screenshot saved: debug-${cinemaId}.png`);
        } catch (e) {
          console.log('   ⚠ Could not save screenshot');
        }

        // DEBUG: Get page title to confirm page loaded
        const pageTitle = await page.title();
        console.log(`   📄 Page title: ${pageTitle}`);

        // Extract movie data from the page
        movies = await page.evaluate(() => {
          const results = [];

          // Find all movie links
          const movieLinks = document.querySelectorAll('a[href*="/films/"]');

          movieLinks.forEach((link, index) => {
            const href = link.getAttribute('href');
            const name = link.textContent?.trim() ||
                        link.getAttribute('title') ||
                        link.getAttribute('aria-label');

            if (name && name.length > 0 && name.length < 200 && href) {
              const id = href.split('/').filter(Boolean).pop() || `film-${index}`;

              // Skip generic "Films" links
              if (name.toLowerCase() === 'films' || name.toLowerCase() === 'movies') {
                return;
              }

              results.push({
                id: id,
                name: name,
                url: href.startsWith('http') ? href : `https://www.odeoncinemas.ie${href}`,
                available: true,
                showtimes: [],
                releaseDate: null
              });
            }
          });

          // Remove duplicates based on name
          const unique = [...new Map(results.map(m => [m.name.toLowerCase(), m])).values()];

          return { results: unique, debugInfo: { 'a[href*="/films/"]': movieLinks.length } };
        });

        // Log debug info
        console.log('   🔍 Found movie links:', movies.debugInfo);
        const movieList = movies.results;

        if (movieList.length === 0) {
          console.log('⚠ No movie links found');
          await page.close();
          return [];
        }

        console.log(`✓ Found ${movieList.length} movies, fetching showtimes...`);

        // Now visit each movie page to get showtimes
        const moviesWithShowtimes = [];

        for (const movie of movieList.slice(0, 10)) { // Limit to first 10 to avoid taking too long
          try {
            console.log(`   📅 Fetching showtimes for: ${movie.name}`);

            await page.goto(movie.url, {
              waitUntil: 'networkidle2',
              timeout: 15000
            });

            await new Promise(resolve => setTimeout(resolve, 1000));

            // Extract showtime information
            const showtimes = await page.evaluate(() => {
              const times = [];

              // Try various selectors for showtime buttons/links
              const selectors = [
                'button[data-session-time]',
                '[data-performance-time]',
                '.showtime',
                '.session-time',
                'a[href*="booking"]',
                'button[class*="time"]',
                '[class*="showtime"]',
                'time'
              ];

              for (const selector of selectors) {
                const elements = document.querySelectorAll(selector);

                elements.forEach(el => {
                  const timeText = el.textContent?.trim() ||
                                  el.getAttribute('data-session-time') ||
                                  el.getAttribute('data-performance-time') ||
                                  el.getAttribute('datetime');

                  const dateText = el.getAttribute('data-date') ||
                                  el.closest('[data-date]')?.getAttribute('data-date') ||
                                  el.closest('[class*="date"]')?.textContent?.trim();

                  if (timeText && timeText.match(/\d{1,2}:\d{2}/)) {
                    times.push({
                      time: timeText.trim(),
                      date: dateText || 'Today',
                      format: el.getAttribute('data-format') ||
                             el.textContent?.includes('IMAX') ? 'IMAX' : 'Standard'
                    });
                  }
                });

                if (times.length > 0) break;
              }

              return times;
            });

            moviesWithShowtimes.push({
              id: movie.id,
              name: movie.name,
              available: showtimes.length > 0,
              showtimes: showtimes,
              showtimeCount: showtimes.length,
              releaseDate: null
            });

            console.log(`      ✓ ${showtimes.length} showtimes found`);

          } catch (error) {
            console.log(`      ⚠ Failed to fetch showtimes: ${error.message}`);
            // Add movie anyway with 0 showtimes
            moviesWithShowtimes.push({
              id: movie.id,
              name: movie.name,
              available: true,
              showtimes: [],
              showtimeCount: 0,
              releaseDate: null
            });
          }
        }

        console.log(`✓ Processed ${moviesWithShowtimes.length} movies with showtime data`);
        moviesWithShowtimes.forEach(m => {
          const timesPreview = m.showtimes.slice(0, 3).map(s => s.time).join(', ');
          console.log(`   - ${m.name} (${m.showtimeCount} showtimes${timesPreview ? ': ' + timesPreview + '...' : ''})`);
        });

        await page.close();
        return moviesWithShowtimes;

      } catch (urlError) {
        console.log(`   Failed ${url}:`, urlError.message);
        continue;
      }
    }

    console.log('⚠ No movies found at any URL');
    await page.close();
    return [];

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
