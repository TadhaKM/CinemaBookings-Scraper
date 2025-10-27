const puppeteer = require('puppeteer');

// Cache browser instance
let browser = null;

async function getBrowser() {
  if (!browser || !browser.isConnected()) {
    console.log('🚀 Launching Puppeteer browser...');
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    console.log('✓ Browser launched successfully');
  }
  return browser;
}

/**
 * Get movie showtimes for a SPECIFIC movie URL
 */
async function getMovieShowtimes(movieUrl, cinemaId) {
  console.log(`   📅 Fetching showtimes for specific movie...`);

  const browser = await getBrowser();
  const page = await browser.newPage();

  // Capture API responses
  const apiResponses = [];

  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('showtime') || url.includes('session') || url.includes('WSVistaWebClient')) {
      try {
        const contentType = response.headers()['content-type'] || '';
        if (contentType.includes('application/json')) {
          const data = await response.json();
          apiResponses.push({ url, data });
          console.log(`      📡 API captured: showtimes endpoint`);
        }
      } catch (e) {}
    }
  });

  try {
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    await page.goto(movieUrl, { waitUntil: 'networkidle2', timeout: 15000 });
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Click "Book Now" button
    const bookClicked = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button, a')).find(b =>
        b.textContent.toLowerCase().includes('book'));
      if (btn) { btn.click(); return true; }
      return false;
    });
    if (bookClicked) {
      console.log(`      🎫 Clicked "Book Now"`);
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    // Click "Add Cinema" button
    const addCinemaClicked = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button, a')).find(b =>
        b.textContent.toLowerCase().includes('cinema'));
      if (btn) { btn.click(); return true; }
      return false;
    });
    if (addCinemaClicked) {
      console.log(`      🎬 Clicked "Add Cinema"`);
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    // Select cinema
    const selected = await page.evaluate((cid) => {
      const elem = Array.from(document.querySelectorAll('*')).find(el =>
        el.textContent.toLowerCase().includes(cid.toLowerCase()));
      if (elem) { try { elem.click(); return true; } catch(e) {} }
      return false;
    }, cinemaId);
    if (selected) {
      console.log(`      ✅ Selected cinema: ${cinemaId}`);
      await new Promise(resolve => setTimeout(resolve, 4000));
    }

    // Click date buttons to load more showtimes
    const dateClicked = await page.evaluate(() => {
      let clicked = 0;
      document.querySelectorAll('button, a, [role="button"]').forEach(btn => {
        const text = btn.textContent.toLowerCase();
        if (text.match(/mon|tue|wed|thu|fri|sat|sun|tomorrow|today/) && text.length < 50) {
          try { btn.click(); clicked++; } catch(e) {}
        }
      });
      return clicked;
    });
    if (dateClicked > 0) {
      console.log(`      📅 Clicked ${dateClicked} date buttons`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Scroll to trigger lazy loading
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await new Promise(resolve => setTimeout(resolve, 1000));

    // First try to extract from captured API responses
    let showtimes = [];

    if (apiResponses.length > 0) {
      console.log(`      📡 Processing ${apiResponses.length} API responses...`);

      for (const { url, data } of apiResponses) {
        try {
          // Vista WebClient API structure
          if (data && data.Dates) {
            for (const dateEntry of data.Dates) {
              const dateStr = dateEntry.Date || dateEntry.BusinessDate || 'Unknown';

              if (dateEntry.Sessions && Array.isArray(dateEntry.Sessions)) {
                for (const session of dateEntry.Sessions) {
                  const time = session.SessionTime || session.ShowTime;
                  if (time) {
                    let format = 'Standard';
                    const attributes = session.Attributes || [];

                    if (attributes.some(a => a.toUpperCase().includes('IMAX'))) {
                      format = 'IMAX';
                    } else if (attributes.some(a => a.includes('3D'))) {
                      format = '3D';
                    } else if (attributes.some(a => a.toUpperCase().includes('DOLBY'))) {
                      format = 'Dolby';
                    }

                    showtimes.push({
                      time: time,
                      date: dateStr,
                      format: format,
                      source: 'api'
                    });
                  }
                }
              }
            }
          }
          // Alternative API structure
          else if (data && Array.isArray(data)) {
            for (const item of data) {
              if (item.sessions || item.showtimes) {
                const sessions = item.sessions || item.showtimes;
                const dateStr = item.date || item.businessDate || 'Unknown';

                for (const session of sessions) {
                  const time = session.time || session.sessionTime;
                  if (time) {
                    showtimes.push({
                      time: time,
                      date: dateStr,
                      format: session.format || 'Standard',
                      source: 'api'
                    });
                  }
                }
              }
            }
          }
        } catch (e) {
          console.log(`      ⚠ Error parsing API response: ${e.message}`);
        }
      }
    }

    // If API extraction found nothing, fall back to HTML scraping
    if (showtimes.length === 0) {
      console.log(`      🔍 API extraction found 0 showtimes, trying HTML...`);

      showtimes = await page.evaluate(() => {
        const times = [];

        // Strategy 1: Find ALL buttons/links with time patterns
        document.querySelectorAll('button, a, [role="button"], [class*="session"], [class*="showtime"]').forEach(btn => {
          const text = btn.textContent?.trim() || '';
          const ariaLabel = btn.getAttribute('aria-label') || '';
          const fullText = text + ' ' + ariaLabel;

          // Look for time patterns (14:30, 19:00, etc.)
          const timeMatch = fullText.match(/(\d{1,2}):(\d{2})/);

          if (timeMatch) {
            // Try to find date context
            let dateText = 'Today';
            let parent = btn.closest('[class*="date"], [data-date], [id*="date"]');
            if (parent) {
              dateText = parent.getAttribute('data-date') ||
                        parent.querySelector('[class*="date"]')?.textContent?.trim() ||
                        parent.textContent?.match(/(Mon|Tue|Wed|Thu|Fri|Sat|Sun|Today|Tomorrow)/i)?.[0] ||
                        'Today';
            }

            // Check format (IMAX, 3D, Dolby, etc.)
            let format = 'Standard';
            if (fullText.toUpperCase().includes('IMAX')) {
              format = 'IMAX';
            } else if (fullText.includes('3D')) {
              format = '3D';
            } else if (fullText.toUpperCase().includes('DOLBY')) {
              format = 'Dolby';
            }

            times.push({
              time: timeMatch[0],
              date: dateText,
              format: format,
              source: 'html'
            });
          }
        });

        return times;
      });
    }

    // Deduplicate by date-time-format
    const seen = new Set();
    const uniqueShowtimes = showtimes.filter(t => {
      const key = `${t.date}-${t.time}-${t.format}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    console.log(`      ✓ ${uniqueShowtimes.length} showtimes found (${showtimes.filter(s => s.source === 'api').length} from API, ${showtimes.filter(s => s.source === 'html').length} from HTML)`);
    await page.close();
    return uniqueShowtimes;

  } catch (error) {
    console.error(`      ⚠ Showtime fetch error: ${error.message}`);
    await page.close();
    return [];
  }
}

async function closeBrowser() {
  if (browser) {
    await browser.close();
    browser = null;
  }
}

module.exports = {
  getMovieShowtimes,
  closeBrowser
};
