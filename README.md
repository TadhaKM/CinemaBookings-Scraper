# Odeon Dublin Movie Tracker

A web application that scrapes Odeon Cinema Dublin's website and notifies you when a specific movie you want to watch becomes available to book at your chosen Odeon cinema in Dublin.

## Features

- **Track Multiple Movies**: Add any movie you want to watch at any Odeon Dublin cinema
- **Automatic Checking**: The app checks for movie availability every 30 minutes automatically
- **Real-time Notifications**: Get instant notifications when your tracked movies become available
- **Manual Search**: Search for movies immediately without waiting for scheduled checks
- **Clean Web Interface**: Modern Vue.js-powered interface to manage your tracked movies
- **Persistent Storage**: Your tracked movies and notifications are saved locally
- **Dublin-Focused**: Specifically targets Odeon cinemas in Dublin

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

## Dublin Odeon Cinemas Supported

The app includes these Odeon cinemas in Dublin:
- Odeon Point Square (Point Village, Dublin 1)
- Odeon Blanchardstown (Blanchardstown Centre, Dublin 15)
- Odeon Coolock (Northside Shopping Centre, Dublin 5)
- Odeon Stillorgan (Stillorgan, Co. Dublin)

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
Adds a new movie to track.
```json
{
  "movieName": "Dune: Part Two",
  "cinemaId": "point-square",
  "cinemaName": "Odeon Point Square"
}
```

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
│   └── movie-tracker.js         # Movie tracking and notification logic
├── public/
│   ├── index.html               # Main web interface (Vue.js)
│   ├── styles.css               # Styling
│   └── app.js                   # Vue.js application
└── data/
    ├── tracked-movies.json      # Stored tracked movies
    └── notifications.json       # Stored notifications
```

## How It Works

1. **Scraping**: Firecrawl loads the cinema page (rendering JavaScript) and an LLM extracts films + showtimes against a JSON schema. If Firecrawl isn't configured or a scrape fails, the app falls back to mock data
2. **Tracking**: Movies are stored in a JSON file with their tracking status
3. **Checking**: A cron job runs every 30 minutes to check all tracked movies
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
