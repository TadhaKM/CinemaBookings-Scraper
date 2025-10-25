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
        const hasBahubali = pageHTML.toLowerCase().includes('bahubali');
        console.log(`   🔎 Page contains "bahubali": ${hasBahubali}`);
        if (hasBahubali) {
          console.log(`   🎯 FOUND BAHUBALI IN HTML! Now extracting...`);
        }

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

    console.log(`✓ Found ${movieList.length} total unique movies across all pages, fetching showtimes...`);

        // Now visit each movie page to get showtimes
        const moviesWithShowtimes = [];

        // Process all movies but only fetch detailed showtimes for first 20 to save time
        for (const movie of movieList.slice(0, 20)) { // Fetch showtimes for first 20
          try {
            console.log(`   📅 Fetching showtimes for: ${movie.name}`);

            await page.goto(movie.url, {
              waitUntil: 'networkidle2',
              timeout: 15000
            });

            // Wait longer for JavaScript to load showtimes
            await new Promise(resolve => setTimeout(resolve, 3000));

            // Try to click date buttons to show showtimes for different days
            try {
              const dateButtonsClicked = await page.evaluate(() => {
                const dateButtons = Array.from(document.querySelectorAll('button, a, [role="button"]'))
                  .filter(btn => {
                    const text = btn.textContent.toLowerCase();
                    // Look for date-like text (day names, "tomorrow", etc.)
                    return text.match(/mon|tue|wed|thu|fri|sat|sun|tomorrow|today/) &&
                           text.length < 50; // Not a huge container
                  });

                // Click first few date buttons to load their showtimes
                dateButtons.slice(0, 3).forEach(btn => {
                  if (btn.tagName === 'BUTTON' || btn.tagName === 'A') {
                    try {
                      btn.click();
                    } catch (e) {}
                  }
                });

                return dateButtons.length;
              });

              if (dateButtonsClicked > 0) {
                console.log(`      📅 Clicked ${dateButtonsClicked} date buttons`);
                await new Promise(resolve => setTimeout(resolve, 2000));
              }
            } catch (e) {}

            // Scroll to trigger lazy loading of showtimes
            await page.evaluate(() => {
              window.scrollTo(0, document.body.scrollHeight);
            });
            await new Promise(resolve => setTimeout(resolve, 1000));

            // DEBUG: Save movie page HTML and screenshot for first movie
            if (moviesWithShowtimes.length === 0) {
              try {
                const movieHTML = await page.content();
                const fs = require('fs');
                fs.writeFileSync(`debug-movie-page.html`, movieHTML);
                await page.screenshot({ path: 'debug-movie-page.png', fullPage: true });
                console.log(`      💾 Movie page HTML and screenshot saved for debugging`);
              } catch (e) {}
            }

            // Extract showtime information with AGGRESSIVE extraction
            const showtimes = await page.evaluate(() => {
              const times = [];
              const debug = {
                totalButtons: 0,
                buttonsWithTime: 0,
                totalElements: 0,
                elementsWithTime: 0
              };

              // Strategy 1: Find ALL buttons that might be showtimes
              const buttons = document.querySelectorAll('button, a, [role="button"]');
              debug.totalButtons = buttons.length;

              buttons.forEach(btn => {
                const text = btn.textContent?.trim() || '';
                const href = btn.getAttribute('href') || '';

                // Look for time patterns (14:30, 19:00, etc.)
                const timeMatch = text.match(/(\d{1,2}):(\d{2})/);

                if (timeMatch) {
                  debug.buttonsWithTime++;
                  // Try to find date context
                  let dateText = 'Today';

                  // Look for date in parent elements
                  let parent = btn.closest('[class*="date"], [data-date]');
                  if (parent) {
                    dateText = parent.getAttribute('data-date') ||
                              parent.querySelector('[class*="date"]')?.textContent?.trim() ||
                              'Today';
                  }

                  // Check if it's IMAX or other format
                  let format = 'Standard';
                  if (text.toUpperCase().includes('IMAX')) {
                    format = 'IMAX';
                  } else if (text.includes('3D')) {
                    format = '3D';
                  }

                  times.push({
                    time: timeMatch[0],
                    date: dateText,
                    format: format
                  });
                }
              });

              // Strategy 2: Look for ANY element with time-like text
              if (times.length === 0) {
                const allElements = document.querySelectorAll('*');
                debug.totalElements = allElements.length;

                allElements.forEach(el => {
                  const text = el.textContent?.trim() || '';

                  // Only look at small elements (not huge containers)
                  if (text.length > 100) return;

                  const timeMatch = text.match(/\b(\d{1,2}):(\d{2})\b/);

                  if (timeMatch && el.children.length === 0) { // Leaf node only
                    debug.elementsWithTime++;
                    times.push({
                      time: timeMatch[0],
                      date: 'Today',
                      format: text.includes('IMAX') ? 'IMAX' : 'Standard'
                    });
                  }
                });
              }

              // Deduplicate times
              const seen = new Set();
              const unique = times.filter(t => {
                const key = `${t.date}-${t.time}-${t.format}`;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
              });

              return { showtimes: unique, debug };
            });

            const showtimeData = showtimes.showtimes || showtimes;
            const showtimeDebug = showtimes.debug || {};

            // Log debug info if no showtimes found
            if (showtimeData.length === 0 && moviesWithShowtimes.length === 0) {
              console.log(`      🔍 Debug: ${showtimeDebug.totalButtons} buttons (${showtimeDebug.buttonsWithTime} with time), ${showtimeDebug.totalElements} elements scanned`);
            }

            moviesWithShowtimes.push({
              id: movie.id,
              name: movie.name,
              available: showtimeData.length > 0,
              showtimes: showtimeData,
              showtimeCount: showtimeData.length,
              releaseDate: null
            });

            console.log(`      ✓ ${showtimeData.length} showtimes found`);

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

        // Add remaining movies without detailed showtimes (so they can still be searched/tracked)
        const processedUrls = new Set(moviesWithShowtimes.map(m => m.url));
        const remainingMovies = movieList
          .filter(m => !processedUrls.has(m.url))
          .map(m => ({
            id: m.id,
            name: m.name,
            available: true, // Listed on site, so available
            showtimes: [], // Didn't fetch showtimes to save time
            showtimeCount: 0,
            releaseDate: null,
            url: m.url
          }));

        if (remainingMovies.length > 0) {
          console.log(`✓ Added ${remainingMovies.length} more movies without detailed showtimes`);
          console.log(`   (Total: ${moviesWithShowtimes.length + remainingMovies.length} movies available)`);
        }

        const allMoviesResult = [...moviesWithShowtimes, ...remainingMovies];

    await page.close();
    return allMoviesResult;

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
