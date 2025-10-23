# Cineworld Movie Tracker

A web application that scrapes Cineworld's website and notifies you when a specific movie you want to watch becomes available to book at your chosen cinema.

## Features

- **Track Multiple Movies**: Add any movie you want to watch at any Cineworld cinema
- **Automatic Checking**: The app checks for movie availability every 30 minutes automatically
- **Real-time Notifications**: Get instant notifications when your tracked movies become available
- **Manual Search**: Search for movies immediately without waiting for scheduled checks
- **Clean Web Interface**: Easy-to-use interface to manage your tracked movies
- **Persistent Storage**: Your tracked movies and notifications are saved locally

## Technology Stack

- **Backend**: Node.js with Express
- **Web Scraping**: Axios and Cheerio
- **Scheduling**: node-cron for periodic checks
- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Storage**: JSON file-based storage

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd claude
```

2. Install dependencies:
```bash
npm install
```

3. Start the server:
```bash
npm start
```

Or for development with auto-restart:
```bash
npm run dev
```

4. Open your browser and navigate to:
```
http://localhost:3000
```

## Usage

### Tracking a Movie

1. Enter the movie name you want to track (e.g., "Dune: Part Two")
2. Select the Cineworld cinema location
3. Click "Start Tracking" to add it to your tracked list
4. The app will automatically check every 30 minutes

### Searching Immediately

If you want to check right away instead of waiting:
1. Fill in the movie name and cinema
2. Click "Search Now" to get immediate results

### Managing Tracked Movies

- View all your tracked movies in the "Tracked Movies" section
- Each movie shows its status: "TRACKING" (not found yet) or "FOUND" (now available)
- Click "Check All Now" to manually trigger a check for all tracked movies
- Click "Remove" on any movie to stop tracking it

### Notifications

- When a tracked movie becomes available, you'll receive a notification
- Notifications show the movie name, cinema, and number of showtimes
- Click "Clear All" to remove all notifications

## API Endpoints

### GET /api/cinemas
Returns a list of all Cineworld cinemas.

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
  "cinemaId": "3",
  "cinemaName": "Cineworld London Leicester Square"
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
claude/
├── server.js                 # Main Express server
├── package.json              # Dependencies
├── scraper/
│   └── cineworld-scraper.js  # Web scraping logic
├── services/
│   └── movie-tracker.js      # Movie tracking and notification logic
├── public/
│   ├── index.html            # Main web interface
│   ├── styles.css            # Styling
│   └── app.js                # Frontend JavaScript
└── data/
    ├── tracked-movies.json   # Stored tracked movies
    └── notifications.json    # Stored notifications
```

## How It Works

1. **Scraping**: The app uses Cineworld's public API endpoints when available, falling back to HTML scraping if needed
2. **Tracking**: Movies are stored in a JSON file with their tracking status
3. **Checking**: A cron job runs every 30 minutes to check all tracked movies
4. **Notifications**: When a movie status changes from "not found" to "found", a notification is created
5. **Persistence**: All data is stored in JSON files in the `data/` directory

## Configuration

- **Check Interval**: Modify the cron schedule in `server.js` (default: `*/30 * * * *` = every 30 minutes)
- **Port**: Set the `PORT` environment variable (default: 3000)

## Notes

- The scraper is designed to work with Cineworld UK's website structure
- If Cineworld changes their website, the scraper may need updates
- The app respects rate limits by checking at reasonable intervals
- All data is stored locally - no external database required

## Troubleshooting

**Movies not being found:**
- Check that the movie name matches exactly (or closely) to how it appears on Cineworld's website
- Try searching manually first to see if the movie is listed
- The movie may not be released yet

**Scraper not working:**
- Cineworld may have changed their website structure
- Check the console logs for error messages
- Network issues may prevent scraping

## Future Enhancements

- Email/SMS notifications
- Support for other cinema chains
- Advanced search with filters (date, time, format)
- Browser notifications
- Mobile app

## License

MIT
