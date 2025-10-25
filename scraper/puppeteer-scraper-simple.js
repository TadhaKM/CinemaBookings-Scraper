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

    // Extract showtimes
    const showtimes = await page.evaluate(() => {
      const times = [];
      document.querySelectorAll('button, a, [role="button"]').forEach(btn => {
        const text = btn.textContent?.trim() || '';
        const match = text.match(/(\d{1,2}):(\d{2})/);
        if (match) {
          times.push({
            time: match[0],
            date: 'Today',
            format: text.includes('IMAX') ? 'IMAX' : 'Standard',
            source: 'button'
          });
        }
      });
      // Deduplicate
      const seen = new Set();
      return times.filter(t => {
        const key = `${t.date}-${t.time}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    });

    console.log(`      ✓ ${showtimes.length} showtimes found`);
    await page.close();
    return showtimes;

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
