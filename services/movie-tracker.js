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

  const newMovie = {
    id: Date.now().toString(),
    movieName: movieName,
    cinemaId: cinemaId,
    cinemaName: cinemaName || 'Unknown Cinema',
    addedAt: new Date().toISOString(),
    lastChecked: null,
    status: 'tracking',
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

  const notification = {
    id: Date.now().toString(),
    movieName: movieName,
    cinemaName: cinemaName,
    message: `${movieName} is now available at ${cinemaName}!`,
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
      console.log(`Checking: ${movie.movieName} at cinema ${movie.cinemaId}`);

      const result = await odeonScraper.searchMovie(movie.movieName, movie.cinemaId);

      movie.lastChecked = new Date().toISOString();

      if (result.found && result.movies.length > 0) {
        const foundMovie = result.movies[0];

        // If this is the first time we've found it, create a notification
        if (movie.status !== 'found') {
          movie.status = 'found';
          movie.foundAt = new Date().toISOString();

          // Calculate showtime count
          const showtimeCount = foundMovie.showtimeCount ||
                               (Array.isArray(foundMovie.showtimes) ? foundMovie.showtimes.length : 0);

          addNotification(
            movie.movieName,
            movie.cinemaName,
            {
              showtimes: foundMovie.showtimes,
              showtimeCount: showtimeCount,
              movieId: foundMovie.id,
              releaseDate: foundMovie.releaseDate
            }
          );
        }

        // Display showtime count properly
        const showtimeCount = foundMovie.showtimeCount ||
                             (Array.isArray(foundMovie.showtimes) ? foundMovie.showtimes.length :
                             (typeof foundMovie.showtimes === 'number' ? foundMovie.showtimes : 0));

        console.log(`✓ Found: ${movie.movieName} (${showtimeCount} showtimes)`);
      } else {
        console.log(`✗ Not found: ${movie.movieName}`);
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
