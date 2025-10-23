# Using Puppeteer for Real Scraping

This guide explains how to enable **real scraping** using Puppeteer instead of mock data.

## What is Puppeteer?

Puppeteer is a headless Chrome browser controlled by Node.js. It acts like a real person browsing the website, which bypasses most anti-bot protection (like the 403 errors we were getting).

## Advantages

✅ **Gets real movie data** from Odeon's website
✅ **Bypasses 403 errors** - looks like a real browser
✅ **Works with JavaScript-heavy sites** - waits for content to load
✅ **More reliable** than simple HTTP requests

## Disadvantages

⚠️ **Slower** - takes 5-15 seconds per page load
⚠️ **More resources** - uses ~100-200MB RAM
⚠️ **Larger install** - downloads Chromium (~200MB)

## Installation

### Step 1: Install Puppeteer

```powershell
npm install
```

This will download Puppeteer and Chromium automatically. It may take a few minutes.

You'll see:
```
Downloading Chromium...
```

### Step 2: Enable Puppeteer Mode

**On Windows PowerShell:**
```powershell
$env:USE_PUPPETEER="true"
$env:PORT=3002
npm start
```

**On Mac/Linux:**
```bash
USE_PUPPETEER=true PORT=3002 npm start
```

## What You'll See

When Puppeteer is enabled, you'll see these logs:

```
🎬 Fetching Odeon Dublin cinemas...
Using Puppeteer for real scraping...
🚀 Launching Puppeteer browser...
✓ Browser launched successfully
   Loading: https://www.odeoncinemas.ie/cinemas/
   Extracting cinema data from page...
✓ Found 4 Dublin cinemas
   - Odeon Point Square
   - Odeon Blanchardstown
   - Odeon Coolock
   - Odeon Stillorgan
```

When searching for movies:
```
🎬 Fetching movies for cinema: point-square
Using Puppeteer for real scraping...
   Loading: https://www.odeoncinemas.ie/cinemas/point-square/
   Extracting movie data from page...
✓ Found 15 movies
   - Tron: Ares (8 showtimes)
   - Wicked (12 showtimes)
   - Nosferatu (6 showtimes)
   ...
```

## Switching Between Mock and Real Data

### Use Mock Data (Fast, for testing)
```powershell
# Don't set USE_PUPPETEER or set it to false
$env:USE_PUPPETEER="false"
npm start
```

### Use Real Data (Slow, for production)
```powershell
$env:USE_PUPPETEER="true"
npm start
```

## Performance Tips

### 1. Browser Stays Open
The browser stays open between requests to save time. It only opens once when you start the server.

### 2. Caching
Consider implementing caching for movie data:
- Cache cinema list for 24 hours
- Cache movie listings for 30 minutes
- Reduces load time and server resources

### 3. Scheduled Checks
The 30-minute automatic checks work great with Puppeteer since the browser stays open.

## Troubleshooting

### Problem: "Chromium revision is not downloaded"

**Solution:**
```powershell
npm install puppeteer --force
```

### Problem: Puppeteer fails to launch on Windows

**Error:** `Failed to launch the browser process`

**Solution:**
Make sure you have the Visual C++ Redistributable installed:
- Download: https://aka.ms/vs/17/release/vc_redist.x64.exe

### Problem: "Browser closed unexpectedly"

**Solution:** The server may have crashed. Restart:
```powershell
$env:USE_PUPPETEER="true"
npm start
```

### Problem: Very slow on first run

This is normal! Puppeteer needs to:
1. Download Chromium (~200MB) - first time only
2. Launch the browser - takes 3-5 seconds
3. Load the page - takes 2-5 seconds per page

Subsequent searches are faster since the browser stays open.

### Problem: Too much memory usage

**Solution:** Reduce the scheduled check frequency in `server.js`:
```javascript
// Change from every 30 minutes to every 2 hours
cron.schedule('0 */2 * * *', async () => {
  ...
});
```

## How It Works

1. **Browser Launch:** Puppeteer opens a headless Chrome browser
2. **Page Navigation:** Navigates to Odeon's website like a real user
3. **Wait for Content:** Waits for JavaScript to load all movies
4. **Extract Data:** Runs JavaScript in the page to extract movie info
5. **Return Results:** Sends data back to your app

## Real vs Mock Data Comparison

| Feature | Mock Data | Puppeteer (Real) |
|---------|-----------|------------------|
| Speed | Instant | 5-15 seconds |
| Accuracy | Fake data | Real from website |
| Works Offline | ✅ Yes | ❌ No |
| 403 Errors | ✅ None | ✅ Bypasses |
| Memory Usage | ~50MB | ~200MB |
| Setup | None | Chromium download |

## Recommended Usage

**Development/Testing:**
- Use mock data for quick testing
- Fast iteration on features

**Production/Real Use:**
- Enable Puppeteer for accurate data
- Set up on a server that runs 24/7
- Real notifications for real movies

## Advanced: Debugging Puppeteer

To see what Puppeteer is actually seeing, enable headful mode:

Edit `scraper/puppeteer-scraper.js`:
```javascript
browser = await puppeteer.launch({
  headless: false,  // Change from 'new' to false
  ...
});
```

This will open a real Chrome window so you can watch it scrape!

## Next Steps

Once Puppeteer is working:
1. Test searching for "Tron: Ares" or other current movies
2. Verify the fuzzy matching still works with real data
3. Track a real movie and wait for the 30-minute check
4. Deploy to a server for 24/7 operation

Enjoy real-time movie tracking! 🎬
