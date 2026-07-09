# Odeon Dublin Movie Tracker

A web application that scrapes Odeon Cinema Dublin's website and notifies you when a specific movie you want to watch becomes available to book at your chosen Odeon cinema in Dublin.

## Features

- **Track coming-soon films**: Track a film even before it's bookable — the app watches ODEON's **ALL Films** listing and alerts you the moment it moves from *Coming soon* to *Pre-book* / *Now showing*
- **Release-aware scheduling**: Release dates come from [the-numbers.com](https://www.the-numbers.com/movies/release-schedule/2026) (cached locally). Checking starts a configurable number of days before release (default 10) and ramps up: every **3h** from 10–8 days out, **2h** at 7–6 days, and **hourly** for the final stretch
- **Fully configurable intervals**: The whole cadence is editable in the UI (*Check schedule* panel) — set the lead window, add/remove tiers ("within N days of release → check every H hours", down to 15-minute intervals), and set the fallback interval for films with no known release date. Changes apply to existing tracked films immediately
- **Manual release dates**: If a film isn't in the schedule, enter its release date yourself and choose how many days before to start looking
- **One, several, or all cinemas**: Track a film at a specific Dublin ODEON, a few of them, or "any" cinema
- **Real-time Notifications**: Get notified when a tracked film becomes bookable (with showtimes where available)
- **Email / phone push / SMS alerts**: Fires once, the moment a film becomes bookable — via SMTP email, [ntfy.sh](https://ntfy.sh) phone push (free, no account), and/or Twilio SMS. Each channel is independent and a failing one never breaks the check loop
- **Manual Search**: Look up a film's status and showtimes immediately
- **Clean Web Interface**: Modern Vue.js interface with poster art and status badges
- **Persistent Storage**: Tracked films and notifications are saved locally
- **Dublin-Focused**: Targets ODEON cinemas in Dublin

## Technology Stack

- **Backend**: Node.js with Express
- **Web Scraping**: [Firecrawl](https://www.firecrawl.dev) structured extraction (LLM-based) — hands the target page a JSON schema and gets clean, structured movie/showtime data back, so it's resilient to markup changes
- **Scheduling**: node-cron for periodic checks
- **Frontend**: Vue.js 3 (via CDN), HTML5, CSS3
- **Storage**: JSON file-based storage

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd CinemaBookings-Scraper
```

2. Install dependencies:
```bash
npm install
```

3. Configure your Firecrawl API key:
```bash
cp .env.example .env
# then edit .env and paste your key:
# FIRECRAWL_API_KEY=fc-...
```
Get a key at <https://www.firecrawl.dev/app/api-keys>. **Without a key the app still runs**, using built-in mock data so you can develop the UI offline.

4. Start the server:
```bash
npm start
```

Or for development with auto-restart:
```bash
npm run dev
```

5. Open your browser and navigate to:
```
http://localhost:3000
```

## Usage

### Tracking a Movie

1. Enter the movie name you want to track (e.g., "Dune: Part Two")
2. Select the Odeon Dublin cinema location from the dropdown
3. Click "Track this film" to add it to your watchlist
4. The app will automatically check every 30 minutes

### Searching Immediately

If you want to check right away instead of waiting:
1. Fill in the movie name and select a cinema
2. Click "Search Now" to get immediate results
3. See available showtimes if the movie is currently showing

### Managing Tracked Movies

- View all your tracked movies in the "Tracked Movies" section
- Each movie shows its status: "TRACKING" (not found yet) or "FOUND" (now available)
- Click "Check All Now" to manually trigger a check for all tracked movies
- Click "Remove" on any movie to stop tracking it

### Notifications

- When a tracked movie becomes available, you'll receive a notification
- Notifications show the movie name, cinema, and number of showtimes
- Click "Clear All" to remove all notifications

## Deployment (Railway)

This app needs an **always-on process** (in-process cron every 10 min) and a
**persistent disk** (`data/` holds your watchlist, settings and schedule cache).
That rules out serverless hosts (Vercel/Netlify/Cloudflare Workers) and any free
tier that sleeps on idle — a sleeping app never checks, so it never alerts you.

### Steps

1. **Push to GitHub**, then on [Railway](https://railway.app): *New Project → Deploy from GitHub repo*.
   It auto-detects the `Dockerfile` via `railway.json`.

2. **Add a Volume** (Service → Settings → Volumes):

   | Field | Value |
   |---|---|
   | Name | `odeon-data` |
   | Mount path | `/app/data` |
   | Size | `1024` MB — the app uses well under 1 MB |

   > ⚠️ Skip this and your watchlist, settings and alerts are wiped on every redeploy.

   The volume mounts root-owned, so `entrypoint.sh` chowns it and then drops from
   root to the `node` user before starting the app.

3. **Set Variables** (Service → Variables):

   | Variable | Required | Notes |
   |---|---|---|
   | `FIRECRAWL_API_KEY` | yes | Otherwise it runs on mock data |
   | `APP_USER` / `APP_PASS` | **yes** | HTTP basic auth — see warning below |
   | `TZ` | recommended | `Europe/Dublin` (already set in the Dockerfile) |
   | `SMTP_HOST` `SMTP_PORT` `SMTP_SECURE` `SMTP_USER` `SMTP_PASS` `SMTP_FROM` | optional | Email alerts |
   | `TWILIO_ACCOUNT_SID` `TWILIO_AUTH_TOKEN` `TWILIO_FROM` | optional | SMS alerts |

   Don't set `PORT` — Railway injects it.
   Notification **recipients** (email address, ntfy topic) are *not* env vars — set
   them in the app's Notifications panel; they persist on the volume.

4. **Keep replicas at 1.** Two instances would double-scrape, send duplicate
   alerts, and race each other on the JSON files.

5. Open the generated URL and log in with `APP_USER` / `APP_PASS`.

### 🔒 Set APP_USER and APP_PASS

Without them **every endpoint is public**: `GET /api/settings` exposes your ntfy
topic (letting anyone read your alerts *and* push fake ones to your phone),
`POST /api/notify/test` can spam you, and `DELETE /api/track/:id` wipes your
watchlist. Auth is skipped when the vars are unset (so local dev is frictionless)
and the server logs a loud warning if that happens in production.

`GET /api/health` stays unauthenticated for Railway's health check.

### Running the container anywhere else

```bash
docker build -t odeon-watch .
docker run -d --name odeon-watch \
  -p 3000:3000 \
  -v odeon-data:/app/data \
  -e FIRECRAWL_API_KEY=fc-... \
  -e APP_USER=you -e APP_PASS=something-long \
  -e TZ=Europe/Dublin \
  odeon-watch
```

## Notifications

Credentials go in `.env`; recipients and on/off toggles are set in the app's **Notifications** panel
(stored in `data/settings.json`). A channel only fires when it's **both** configured in `.env` **and**
enabled with a valid recipient. Use **Send test** to verify before relying on it.

Each film alerts **once**, on the `tracking → found` transition — you won't get repeats every hour.

### Phone push — ntfy.sh (easiest, free)
No account, no API key.
1. Install the **ntfy** app ([iOS](https://apps.apple.com/app/ntfy/id1625396347) / [Android](https://play.google.com/store/apps/details?id=io.heckel.ntfy)).
2. Subscribe to a **secret, unguessable topic name** (e.g. `odeon-a7f3k9q2`).
3. Put the same topic in the Notifications panel and save.

> Anyone who knows the topic can read your alerts. Treat it like a password. Self-host `NTFY_SERVER` if you'd rather.

### Email — SMTP
Works with any SMTP server. For Gmail, create an [App Password](https://myaccount.google.com/apppasswords)
(requires 2FA) — **not** your normal password.
```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false        # true for port 465
SMTP_USER=you@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=you@gmail.com  # optional, defaults to SMTP_USER
```

### SMS — Twilio (costs per message)
```bash
TWILIO_ACCOUNT_SID=ACxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxx
TWILIO_FROM=+15551234567
```
Enter your number in full international format (`+353871234567`). Leave the vars blank to disable SMS.

## Dublin Odeon Cinemas Supported

The cinema list is scraped live from ODEON's site. The five Dublin-area cinemas are:
- ODEON Point Square (Point Village, Dublin 1)
- ODEON Blanchardstown (Blanchardstown Road South, Dublin 15)
- ODEON Charlestown (St. Margaret's Road, Dublin 11)
- ODEON Coolock (84 Malahide Rd, Northside, Coolock)
- ODEON Stillorgan (Stillorgan Plaza, Lower Kilmacud Rd)

ODEON Ireland's other sites (Cavan, Limerick, Naas, Newbridge, Portlaoise, Waterford) are excluded.
Because several Dublin addresses don't literally contain the word "Dublin", the Dublin set is
selected by cinema slug in `scraper/firecrawl-scraper.js` (`DUBLIN_CINEMA_SLUGS`).

## API Endpoints

### GET /api/cinemas
Returns a list of all Odeon Dublin cinemas.

### GET /api/cinemas/:cinemaId/movies
Returns all movies currently showing at a specific cinema.

### GET /api/search?movie=<name>&cinema=<id>
Searches for a specific movie at a specific cinema.

### GET /api/tracked
Returns all tracked movies.

### POST /api/track
Adds a film to track — at one or more cinemas, or "any" ODEON Dublin cinema.
Release date is auto-resolved from the-numbers.com; `releaseDate` overrides it and
`leadDays` sets how many days before release to start checking (default 10).
```json
{
  "movieName": "Dune: Part Three",
  "all": true,
  "cinemaIds": ["point-square", "blanchardstown"],
  "releaseDate": "2026-12-18",
  "leadDays": 10
}
```

### POST /api/notify/test
Sends a test alert through every active channel. Returns `{ sent: [...], failed: [{channel, error}] }`.

### GET /api/settings
Returns the check-schedule settings (`leadDays`, `unknownIntervalHours`, `tiers`), the `notifications` block (recipients + toggles), `defaults`, `tickMinutes`, and a `channels` map showing which channels have credentials configured. **Never returns credentials.**

### PUT /api/settings
Updates the cadence. Values are validated and clamped server-side; tracked films' next-check times are recomputed immediately.
```json
{
  "leadDays": 10,
  "unknownIntervalHours": 3,
  "tiers": [
    { "withinDays": 5,  "everyHours": 1 },
    { "withinDays": 7,  "everyHours": 2 },
    { "withinDays": 10, "everyHours": 3 }
  ]
}
```
Tiers are evaluated ascending: the first tier where `daysUntilRelease <= withinDays` wins.

### GET /api/release-schedule?q=<text>&limit=<n>
Returns the cached the-numbers.com release schedule (optionally filtered by title).

### GET /api/release-schedule/lookup?title=<name>
Fuzzy-looks-up a single film's release date, e.g. `{ "title": "Dune: Part Three", "date": "2026-12-18", "source": "the-numbers" }`.

### DELETE /api/track/:id
Removes a tracked movie.

### GET /api/notifications
Returns all notifications.

### DELETE /api/notifications
Clears all notifications.

### POST /api/check
Manually triggers a check for all tracked movies.

## Project Structure

```
CinemaBookings-Scraper/
├── server.js                    # Main Express server
├── package.json                 # Dependencies
├── .env.example                 # Copy to .env and add your Firecrawl key
├── scraper/
│   ├── firecrawl-scraper.js     # Firecrawl v2 structured extraction (cinemas + movies)
│   ├── odeon-scraper.js         # Orchestration: Firecrawl → mock fallback + fuzzy search
│   └── mock-data.js             # Offline/dev sample data
├── services/
│   ├── movie-tracker.js         # Tracking, notifications, release-aware scheduling
│   ├── release-schedule.js      # the-numbers.com schedule scrape + cache + lookup
│   ├── settings.js              # Configurable cadence tiers + lead window
│   ├── notifier.js              # Email (SMTP) / push (ntfy) / SMS (Twilio) dispatch
│   └── json-store.js            # Atomic JSON reads/writes (no silent data loss)
├── public/
│   ├── index.html               # Main web interface (Vue.js)
│   ├── styles.css               # Styling
│   └── app.js                   # Vue.js application
└── data/
    ├── tracked-movies.json      # Stored tracked movies
    ├── notifications.json       # Stored notifications
    ├── settings.json            # Your check-schedule settings
    └── release-schedule.json    # Cached the-numbers.com release schedule (refreshed daily)
```

## How It Works

1. **Scraping**: Availability is driven by ODEON's **ALL Films** page (`/films/`), which lists every title with its status (*Now showing* / *Pre-book now* / *Coming soon*) — including films not yet in any cinema's daily listings. Firecrawl renders the page and the status/title/poster are parsed from it. One cached scrape covers every tracked film; individual cinema pages are only scraped to fetch showtimes for films that are actually bookable. Falls back to mock data if Firecrawl isn't configured
2. **Tracking**: Movies are stored in a JSON file with their tracking status
3. **Scheduling**: A cron tick runs every 10 minutes and checks only the films that are *due*. Each film's cadence is release-aware — nothing is checked until its lead window opens (default 10 days before release), then it ramps from every 3h → 2h → hourly as release approaches. Release dates come from a locally-cached copy of the-numbers.com schedule (or a manual date you provide)
4. **Notifications**: When a movie status changes from "not found" to "found", a notification is created
5. **Persistence**: All data is stored in JSON files in the `data/` directory
6. **Reactive UI**: Vue.js provides a modern, reactive user interface with real-time updates

## Vue.js Features

The frontend uses Vue.js 3 for:
- **Reactive Data Binding**: Automatic UI updates when data changes
- **Component-based Architecture**: Clean, maintainable code structure
- **Declarative Rendering**: Easy-to-read templates with v-if, v-for, v-model
- **Event Handling**: Simple @click and @submit handlers
- **Computed Properties**: Efficient date formatting and status updates

## Configuration

- **Firecrawl API key**: Set `FIRECRAWL_API_KEY` in `.env` (required for live scraping)
- **Check Interval**: Modify the cron schedule in `server.js` (default: `*/30 * * * *` = every 30 minutes)
- **Port**: Set the `PORT` environment variable (default: 3000)
- **Mock/fallback cinemas & movies**: Edit `scraper/mock-data.js`

## Notes

- The scraper is designed to work with Odeon Ireland's website structure
- If Odeon changes their website, the scraper may need updates
- The app respects rate limits by checking at reasonable intervals
- All data is stored locally - no external database required
- Vue.js is loaded from CDN for simplicity (no build step needed)

## Troubleshooting

**Movies not being found:**
- Check that the movie name matches exactly (or closely) to how it appears on Odeon's website
- Try searching manually first to see if the movie is listed
- The movie may not be released yet at that specific cinema

**Scraper not working:**
- Odeon may have changed their website structure
- Check the console logs for error messages
- Network issues may prevent scraping
- Try accessing the Odeon website directly to verify it's accessible

**Vue.js not loading:**
- Check your internet connection (Vue is loaded from CDN)
- Check browser console for JavaScript errors
- Ensure you're using a modern browser that supports Vue.js 3

## Future Enhancements

- Email/SMS notifications
- Support for other Irish cinema chains (IMC, Omniplex)
- Advanced search with filters (date, time, format)
- Browser push notifications
- Mobile app
- User accounts and cloud sync
- Price tracking

## License

MIT

## About

This app was created to help movie lovers in Dublin track when their favorite films become available at Odeon cinemas. Built with modern web technologies for a fast, responsive experience.
