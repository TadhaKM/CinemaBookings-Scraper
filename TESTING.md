# Testing Guide for Odeon Dublin Movie Tracker

## Changes Made

I've fixed the scraper and added AI-powered fuzzy matching to find movies even if you don't type the exact name.

### New Features:
1. **Fuzzy Matching** - Uses Fuse.js to find closest matches (e.g., "Tron" will find "Tron: Ares")
2. **Better Logging** - Console shows exactly what's happening during searches
3. **Multiple Scraping Methods** - Tries different URL patterns and selectors
4. **Available Movies List** - When no match is found, shows all movies at that cinema
5. **Debug Endpoint** - Special endpoint to see raw data

## How to Test

### Step 1: Install the New Package

```bash
npm install
```

This will install the new `fuse.js` package for fuzzy matching.

### Step 2: Start the Server

```bash
npm start
```

You should see logs like:
```
Odeon Dublin Movie Tracker running on http://localhost:3000
```

### Step 3: Test with Tron: Ares

1. Open http://localhost:3000 in your browser
2. In the "Movie Name" field, try:
   - `Tron` (fuzzy match)
   - `Tron Ares` (fuzzy match)
   - `Tron: Ares` (exact match)
3. Select any Odeon cinema
4. Click "Search Now"

### Step 4: Check the Console Logs

In your terminal where the server is running, you should see detailed logs like:

```
🎬 Fetching movies for cinema: point-square
Trying URL: https://www.odeoncinemas.ie/cinemas/point-square/whats-on
Response status: 200, Content-Type: text/html
✓ Found 15 movies using selector: a[href*="/films/"]
Movies found: Tron: Ares, Wicked, Nosferatu, ...
🔍 Searching for "Tron" at cinema point-square
✓ Found 1 matches using fuzzy search
  - "Tron: Ares" (score: 0.167)
```

### Step 5: Use the Debug Endpoint

To see exactly what movies the scraper finds:

Open in your browser:
```
http://localhost:3000/api/debug/cinema/point-square
```

Replace `point-square` with:
- `blanchardstown`
- `coolock`
- `stillorgan`

This shows you ALL movies found at that cinema with full details.

## What You Should See

### If It Works:
- Search results show "Found X result(s)"
- Movie name appears with showtimes
- Match score shows how close the match is (lower % = better match)

### If It Doesn't Find the Movie:
- Shows "No exact match found"
- Lists all available movies at that cinema
- Check the console logs to see what movies were found

## Troubleshooting

### Problem: "No movies found at this cinema"

**Cause**: The scraper can't access or parse the Odeon website

**Solutions**:
1. Check your internet connection
2. Try the debug endpoint to see raw data
3. Check terminal logs for error messages
4. The Odeon website structure may have changed

### Problem: Movies found but "Tron: Ares" not in the list

**Cause**: The movie might be showing under a different name or at a different cinema

**Solution**:
1. Check the "Available movies at this cinema" list
2. Try a different Odeon cinema
3. Visit odeoncinemas.ie directly to verify the movie is showing

### Problem: Fuzzy matching not working

**Cause**: The match threshold might be too strict

**Solution**: In `scraper/odeon-scraper.js` line 252, increase the `threshold` value:
```javascript
threshold: 0.6, // Try 0.6 instead of 0.4 for looser matching
```

## How Fuzzy Matching Works

The AI-powered fuzzy matching uses the Fuse.js library with these settings:

- **Threshold 0.4**: Only matches that are 60% similar or better
- **Includes score**: Shows how good the match is (0.0 = perfect, 0.5 = okay)
- **Ignore location**: Doesn't care where in the string the match is

### Examples:
- `"Tron"` → Finds `"Tron: Ares"` (score ~0.17)
- `"Wicked"` → Finds `"Wicked"` (score 0.0)
- `"nosferatu"` → Finds `"Nosferatu"` (score 0.0)
- `"dune 2"` → Finds `"Dune: Part Two"` (score ~0.3)

## Next Steps

Once you confirm the scraper is finding movies:

1. Test tracking a movie
2. Check if notifications work
3. Let me know if you need to adjust the fuzzy matching threshold
4. I can add more sophisticated AI matching if needed (OpenAI API, etc.)

## Additional Debug Commands

### Check if Node.js can make HTTPS requests:
```bash
node -e "require('axios').get('https://www.odeoncinemas.ie').then(r => console.log('OK:', r.status)).catch(e => console.log('Error:', e.message))"
```

### Check if Cheerio can parse HTML:
```bash
node -e "const cheerio = require('cheerio'); const $ = cheerio.load('<h1>Test</h1>'); console.log($('h1').text())"
```

Let me know what you see when you test!
