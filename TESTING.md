# Testing Guide — ODEON Watch

The scraper now uses **Firecrawl** structured extraction instead of Puppeteer/Cheerio,
and fuzzy matching (Fuse.js) finds films even when you don't type the exact title.

## 1. Install

```bash
npm install
```

## 2. Configure Firecrawl (optional but recommended)

```bash
cp .env.example .env
# edit .env → FIRECRAWL_API_KEY=fc-...
```

- **With a key**: live data is scraped from odeoncinemas.ie.
- **Without a key**: the app runs on built-in **mock data** so you can test the UI offline.
  The startup log tells you which mode you're in.

## 3. Start the server

```bash
npm start
```

You should see:

```
🎬 Odeon Dublin Movie Tracker running on http://localhost:3000
⏰ Scheduled checks will run every 30 minutes
🔥 Firecrawl: enabled          # or "📦 Firecrawl: not configured — using mock data"
```

## 4. Try it in the browser

Open <http://localhost:3000>, then:

1. Type a film title — fuzzy matching means `Tron`, `Tron Ares`, and `Tron: Ares` all work.
2. Choose a cinema.
3. Click **Search now** to see poster cards with certificates and showtimes, or
   **Track this film** to add it to the watchlist.

## 5. Quick API smoke test

```bash
# List cinemas
curl -s http://localhost:3000/api/cinemas

# Search a film at a cinema
curl -s "http://localhost:3000/api/search?movie=wicked&cinema=point-square"

# Track a film (immediately runs a check)
curl -s -X POST http://localhost:3000/api/track \
  -H "Content-Type: application/json" \
  -d '{"movieName":"Wicked","cinemaId":"point-square","cinemaName":"ODEON Point Square Dublin"}'

# See notifications and tracked movies
curl -s http://localhost:3000/api/notifications
curl -s http://localhost:3000/api/tracked
```

## Troubleshooting

**"Firecrawl: not configured" but I set a key**
- Make sure the file is named `.env` (not `.env.example`) and lives in the project root.
- Restart the server after editing `.env`.

**Live scrape returns nothing / falls back to mock**
- Check the terminal for `⚠ Firecrawl … failed` messages (HTTP status, timeout).
- Confirm your Firecrawl key is valid and has quota at <https://www.firecrawl.dev/app>.
- Odeon may have changed their page layout — adjust the schema/prompt in
  `scraper/firecrawl-scraper.js`.

**A film isn't matched**
- Check the "Currently showing here" list returned on a miss.
- Loosen fuzzy matching by raising `threshold` (default `0.4`) in `scraper/odeon-scraper.js`.

## Fuzzy matching reference

Fuse.js settings: `threshold: 0.4`, `ignoreLocation: true`, scores where `0.0` = perfect match.

- `"Tron"` → `"Tron: Ares"`
- `"dune 2"` → `"Dune: Part Two"`
- `"nosferatu"` → `"Nosferatu"`
