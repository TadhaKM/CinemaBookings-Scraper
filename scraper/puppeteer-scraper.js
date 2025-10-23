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

        // Extract movie data from the page
        movies = await page.evaluate(() => {
          const results = [];

          // Try multiple selectors for movie items
          const selectors = [
            'article[data-film-id]',
            '[data-film]',
            '.film-item',
            '.film-card',
            '.movie-card',
            'a[href*="/films/"]',
            '[data-movie-id]'
          ];

          for (const selector of selectors) {
            const elements = document.querySelectorAll(selector);

            elements.forEach((el, index) => {
              const id = el.getAttribute('data-film-id') ||
                        el.getAttribute('data-film') ||
                        el.getAttribute('data-movie-id') ||
                        el.getAttribute('href')?.split('/').pop() ||
                        `film-${index}`;

              const name = el.querySelector('h2, h3, h4, .film-title, .film-name, .movie-title, .title')?.textContent?.trim() ||
                          el.getAttribute('title') ||
                          el.getAttribute('aria-label');

              if (name && name.length > 0 && name.length < 200) {
                // Count showtime buttons or links
                const showtimes = el.querySelectorAll('[data-session-id], .showtime, .session, button[data-performance], a[href*="booking"]').length;

                results.push({
                  id: id,
                  name: name,
                  available: true,
                  showtimes: showtimes || 0,
                  releaseDate: null
                });
              }
            });

            if (results.length > 0) break;
          }

          return results;
        });

        if (movies.length > 0) {
          console.log(`✓ Found ${movies.length} movies`);

          // Remove duplicates based on name
          const uniqueMovies = [...new Map(movies.map(m => [m.name.toLowerCase(), m])).values()];
          uniqueMovies.forEach(m => console.log(`   - ${m.name} (${m.showtimes} showtimes)`));

          await page.close();
          return uniqueMovies;
        }

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
