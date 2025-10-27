const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

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
    // Capture ALL API responses to find where session times are
    if (url.includes('odeoncinemas.ie') || url.includes('WSVistaWebClient')) {
      try {
        const contentType = response.headers()['content-type'] || '';
        if (contentType.includes('application/json')) {
          const data = await response.json();
          apiResponses.push({ url, data });
          console.log(`      📡 API captured: ${url.split('/').slice(-2).join('/')}`);
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

      // Wait and check multiple times for session times to appear
      let sessionDataFound = false;
      for (let attempt = 1; attempt <= 5; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 3000));

        const hasSessionData = await page.evaluate(() => {
          // Check if any elements have actual session time text
          const text = document.body.textContent;
          const times = text.match(/\b(1[0-2]|[4-9]):[0-5]\d\b/g) || [];
          // Filter out the config default times
          const validTimes = times.filter(t => {
            const [h] = t.split(':').map(Number);
            return h >= 4 && h <= 23;
          });
          return validTimes.length > 0;
        });

        if (hasSessionData) {
          console.log(`      ⏱️  Session times appeared after ${attempt * 3}s`);
          sessionDataFound = true;
          break;
        } else {
          console.log(`      ⏳ Waiting for session times (attempt ${attempt}/5)...`);
        }
      }

      if (!sessionDataFound) {
        console.log(`      ⚠️  No session times detected after 15s wait`);
      }

      // Debug: Save screenshot and HTML after selecting cinema
      try {
        await page.screenshot({ path: path.join(__dirname, '..', 'debug-after-cinema-select.png') });
        const html = await page.content();
        fs.writeFileSync(path.join(__dirname, '..', 'debug-after-cinema-select.html'), html);
        console.log(`      📸 Saved screenshot and HTML after cinema selection`);
      } catch (e) {
        console.log(`      ⚠ Could not save debug files: ${e.message}`);
      }
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
      await new Promise(resolve => setTimeout(resolve, 4000)); // Wait longer for API calls
    }

    // Scroll to trigger lazy loading
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await new Promise(resolve => setTimeout(resolve, 3000)); // Wait longer for API calls

    // First try to extract from captured API responses
    let showtimes = [];

    // Extract film ID and site ID from captured responses for direct API call
    let filmId = null;
    let siteId = null;

    for (const { url, data } of apiResponses) {
      if (data && data.film && data.film.id) {
        filmId = data.film.id;
      }
      if (data && data.filmScreeningDates) {
        for (const dateEntry of data.filmScreeningDates) {
          if (dateEntry.filmScreenings) {
            for (const screening of dateEntry.filmScreenings) {
              if (screening.sites && screening.sites[0]) {
                siteId = screening.sites[0].siteId;
                break;
              }
            }
          }
        }
      }
    }

    // Try direct Vista API call if we have film and site IDs
    if (filmId && siteId) {
      console.log(`      🎯 Making direct Vista API call: filmId=${filmId}, siteId=${siteId}`);
      try {
        const vistaUrl = `https://vwc.odeoncinemas.ie/WSVistaWebClient/ocapi/v1/showtimes/by-business-date/first?siteIds=${siteId}&filmIds=${filmId}`;
        const vistaResponse = await page.evaluate(async (url) => {
          try {
            const response = await fetch(url);
            if (!response.ok) {
              console.log(`Vista API HTTP error: ${response.status}`);
              return { error: `HTTP ${response.status}` };
            }
            const data = await response.json();
            return data;
          } catch (e) {
            console.log(`Vista API fetch error: ${e.message}`);
            return { error: e.message };
          }
        }, vistaUrl);

        if (vistaResponse) {
          console.log(`      🔍 Vista API response keys:`, Object.keys(vistaResponse || {}).join(', '));
          console.log(`      🔍 Vista API response sample:`, JSON.stringify(vistaResponse).substring(0, 500));
          if (!vistaResponse.error) {
            apiResponses.push({ url: vistaUrl, data: vistaResponse });
          }
        } else {
          console.log(`      ⚠ Vista API returned null`);
        }
      } catch (e) {
        console.log(`      ⚠ Vista API call failed: ${e.message}`);
      }
    }

    if (apiResponses.length > 0) {
      console.log(`      📡 Processing ${apiResponses.length} API responses...`);

      for (const { url, data } of apiResponses) {
        try {
          // Debug: Log the structure of the API response
          console.log(`      🔍 API response keys:`, Object.keys(data || {}).join(', '));
          console.log(`      🔍 API response sample:`, JSON.stringify(data).substring(0, 300));

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

      // Save API responses to file for debugging
      try {
        const debugFile = path.join(__dirname, '..', 'debug-api-responses.json');
        fs.writeFileSync(debugFile, JSON.stringify(apiResponses, null, 2));
        console.log(`      💾 Saved ${apiResponses.length} API responses to debug-api-responses.json`);
      } catch (e) {
        console.log(`      ⚠ Could not save API responses: ${e.message}`);
      }
    }

    // If API extraction found nothing, fall back to HTML scraping
    if (showtimes.length === 0) {
      console.log(`      🔍 API extraction found 0 showtimes, trying HTML...`);

      // Log what's on the page for debugging
      const pageInfo = await page.evaluate(() => {
        const bodyText = document.body.textContent;
        const timeMatches = bodyText.match(/\d{1,2}:\d{2}/g) || [];
        return {
          hasText: bodyText.length > 0,
          timeMatchCount: timeMatches.length,
          sampleTimes: timeMatches.slice(0, 5),
          elementCount: document.querySelectorAll('*').length
        };
      });
      console.log(`      🔍 Page has ${pageInfo.elementCount} elements, ${pageInfo.timeMatchCount} time patterns found:`, pageInfo.sampleTimes.join(', '));

      showtimes = await page.evaluate(() => {
        const times = [];

        // Helper: Check if time looks like a session time (not a runtime/duration)
        const isValidSessionTime = (timeStr) => {
          const [hours, mins] = timeStr.split(':').map(Number);
          // Session times are typically 08:00 - 23:59
          // Exclude 00:00-03:00 (these are usually runtimes like 01:30 = 1h 30m)
          if (hours < 4) return false;
          if (hours > 23) return false;
          if (mins > 59) return false;
          return true;
        };

        // Strategy 1: Look in showtime picker / session containers
        const showtimeContainers = document.querySelectorAll(
          '[class*="showtime"], [class*="session"], [class*="picker"], [id*="showtime"], [id*="session"]'
        );

        showtimeContainers.forEach(container => {
          const text = container.textContent || '';
          const timeMatches = text.matchAll(/(\d{1,2}):(\d{2})/g);

          for (const match of timeMatches) {
            const time = match[0];
            if (!isValidSessionTime(time)) continue;

            let dateText = 'Today';
            let format = 'Standard';

            // Search container for date/format context
            const containerText = container.textContent || '';
            const dateMatch = containerText.match(/(Mon|Tue|Wed|Thu|Fri|Sat|Sun|Today|Tomorrow)/i);
            if (dateMatch) dateText = dateMatch[0];

            if (containerText.toUpperCase().includes('IMAX')) format = 'IMAX';
            else if (containerText.includes('3D')) format = '3D';
            else if (containerText.toUpperCase().includes('DOLBY')) format = 'Dolby';

            times.push({
              time: time,
              date: dateText,
              format: format,
              source: 'html-container'
            });
          }
        });

        // Strategy 2: Find clickable time buttons (highest confidence)
        document.querySelectorAll('button, a, [role="button"]').forEach(btn => {
          const text = btn.textContent?.trim() || '';
          const ariaLabel = btn.getAttribute('aria-label') || '';
          const fullText = text + ' ' + ariaLabel;

          // Look for time patterns (14:30, 19:00, etc.)
          const timeMatch = fullText.match(/(\d{1,2}):(\d{2})/);

          if (timeMatch && isValidSessionTime(timeMatch[0])) {
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
              source: 'html-button'
            });
          }
        });

        // Strategy 3: If nothing found yet, search ALL divs/spans (last resort)
        if (times.length === 0) {
          const allElements = document.querySelectorAll('div, span, li, p');
          allElements.forEach(el => {
            const text = el.textContent?.trim() || '';

            // Only look at elements with very short text (likely just a time)
            if (text.length < 20) {
              const timeMatch = text.match(/^(\d{1,2}):(\d{2})$/);
              if (timeMatch && isValidSessionTime(timeMatch[0])) {
                let dateText = 'Today';
                let format = 'Standard';

                // Search parent tree for context
                let parent = el.parentElement;
                let depth = 0;
                while (parent && depth < 10) {
                  const parentText = parent.textContent || '';
                  if (dateText === 'Today') {
                    const dateMatch = parentText.match(/(Mon|Tue|Wed|Thu|Fri|Sat|Sun|Today|Tomorrow)/i);
                    if (dateMatch) dateText = dateMatch[0];
                  }
                  if (parentText.toUpperCase().includes('IMAX')) format = 'IMAX';
                  else if (parentText.includes('3D')) format = '3D';
                  else if (parentText.toUpperCase().includes('DOLBY')) format = 'Dolby';
                  parent = parent.parentElement;
                  depth++;
                }

                times.push({
                  time: timeMatch[0],
                  date: dateText,
                  format: format,
                  source: 'html-div'
                });
              }
            }
          });
        }

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
