const fs = require('fs');
const path = require('path');
const odeonScraper = require('../scraper/odeon-scraper');

const DATA_DIR = path.join(__dirname, '../data');
const TRACKED_FILE = path.join(DATA_DIR, 'tracked-movies.json');
const NOTIFICATIONS_FILE = path.join(DATA_DIR, 'notifications.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

/**
 * Load tracked movies from file
 */
function loadTrackedMovies() {
  try {
    if (fs.existsSync(TRACKED_FILE)) {
      const data = fs.readFileSync(TRACKED_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading tracked movies:', error);
  }
  return [];
}

/**
 * Save tracked movies to file
 */
function saveTrackedMovies(movies) {
  try {
    fs.writeFileSync(TRACKED_FILE, JSON.stringify(movies, null, 2));
  } catch (error) {
    console.error('Error saving tracked movies:', error);
  }
}

/**
 * Load notifications from file
 */
function loadNotifications() {
  try {
    if (fs.existsSync(NOTIFICATIONS_FILE)) {
      const data = fs.readFileSync(NOTIFICATIONS_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading notifications:', error);
  }
  return [];
}

/**
 * Save notifications to file
 */
function saveNotifications(notifications) {
  try {
    fs.writeFileSync(NOTIFICATIONS_FILE, JSON.stringify(notifications, null, 2));
  } catch (error) {
    console.error('Error saving notifications:', error);
  }
}

/**
 * Get all tracked movies
 */
function getTrackedMovies() {
  return loadTrackedMovies();
}

/**
 * Add a movie to track
 */
function addMovie(movieName, cinemaId, cinemaName) {
  const movies = loadTrackedMovies();

  // Don't track the same film at the same cinema twice.
  const existing = movies.find(
    (m) => m.movieName.toLowerCase() === movieName.toLowerCase() && m.cinemaId === cinemaId
  );
  if (existing) return existing;

  const newMovie = {
    id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
    movieName: movieName,
    cinemaId: cinemaId,
    cinemaName: cinemaName || 'Unknown Cinema',
    addedAt: new Date().toISOString(),
    lastChecked: null,
    status: 'tracking', // 'tracking' | 'found'
    filmStatus: 'unknown', // 'now-showing' | 'pre-book' | 'coming-soon' | 'not-listed'
    releaseDate: null,
    posterUrl: null,
    showings: [],
    foundAt: null
  };

  movies.push(newMovie);
  saveTrackedMovies(movies);

  return newMovie;
}

/**
 * Remove a tracked movie
 */
function removeMovie(id) {
  let movies = loadTrackedMovies();
  movies = movies.filter(movie => movie.id !== id);
  saveTrackedMovies(movies);
}

/**
 * Get all notifications
 */
function getNotifications() {
  return loadNotifications();
}

/**
 * Add a notification
 */
function addNotification(movieName, cinemaName, details) {
  const notifications = loadNotifications();

  const statusVerb =
    details.status === 'pre-book' ? 'is now available to pre-book' : 'is now showing';
  const where =
    cinemaName && cinemaName !== 'Any ODEON Dublin cinema' ? ` at ${cinemaName}` : ' at ODEON Dublin';

  const notification = {
    id: Date.now().toString(),
    movieName: movieName,
    cinemaName: cinemaName,
    message: `${movieName} ${statusVerb}${where}!`,
    details: details,
    createdAt: new Date().toISOString(),
    read: false
  };

  notifications.push(notification);
  saveNotifications(notifications);

  console.log(`🎬 NOTIFICATION: ${notification.message}`);

  return notification;
}

/**
 * Clear all notifications
 */
function clearNotifications() {
  saveNotifications([]);
}

/**
 * Check all tracked movies for availability
 */
async function checkTrackedMovies() {
  const movies = loadTrackedMovies();

  console.log(`Checking ${movies.length} tracked movies...`);

  for (const movie of movies) {
    try {
      const anyCinema = movie.cinemaId === 'all';
      console.log(`Checking: ${movie.movieName} (${anyCinema ? 'any cinema' : movie.cinemaId})`);

      const result = await odeonScraper.checkFilm(movie.movieName);

      movie.lastChecked = new Date().toISOString();
      movie.filmStatus = result.status;
      if (result.releaseDate) movie.releaseDate = result.releaseDate;
      if (result.film && result.film.posterUrl) movie.posterUrl = result.film.posterUrl;

      // Decide whether it's bookable *for this tracking entry*.
      let showings = [];
      let bookableHere = false;

      if (result.bookable) {
        if (anyCinema) {
          bookableHere = true;
          showings = await odeonScraper.getShowingsAllCinemas(movie.movieName);
        } else {
          const st = await odeonScraper.getShowtimesAtCinema(movie.movieName, movie.cinemaId);
          if (st && st.showtimeCount > 0) {
            showings = [
              {
                cinemaId: movie.cinemaId,
                cinemaName: movie.cinemaName,
                showtimes: st.showtimes,
                showtimeCount: st.showtimeCount
              }
            ];
            bookableHere = true;
          } else if (result.status === 'pre-book') {
            // Pre-book is site-wide; notify even before local daily listings exist.
            bookableHere = true;
          }
        }
      }

      movie.showings = showings;

      if (bookableHere) {
        if (movie.status !== 'found') {
          movie.status = 'found';
          movie.foundAt = new Date().toISOString();
          addNotification(movie.movieName, movie.cinemaName, {
            status: result.status,
            releaseDate: result.releaseDate,
            showings
          });
        }
        console.log(`✓ Bookable: ${movie.movieName} [${result.status}] — ${showings.length} cinema(s) with times`);
      } else {
        // Reset to tracking if it slipped back (rare) but keep found history.
        if (movie.status !== 'found') movie.status = 'tracking';
        console.log(`… Not bookable yet: ${movie.movieName} [${result.status}]`);
      }
    } catch (error) {
      console.error(`Error checking movie ${movie.movieName}:`, error.message);
    }
  }

  saveTrackedMovies(movies);
  console.log('Check completed!');
}

module.exports = {
  getTrackedMovies,
  addMovie,
  removeMovie,
  getNotifications,
  clearNotifications,
  checkTrackedMovies
};
