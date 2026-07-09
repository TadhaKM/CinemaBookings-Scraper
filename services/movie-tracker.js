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
const DEFAULT_LEAD_DAYS = 10;

function addMovie(movieName, cinemaId, cinemaName, options = {}) {
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
    releaseDate: options.releaseDate || null, // 'YYYY-MM-DD' expected theatrical release
    releaseDateSource: options.releaseDateSource || null, // 'manual' | 'the-numbers' | null
    leadDays: Number.isFinite(options.leadDays) ? options.leadDays : DEFAULT_LEAD_DAYS,
    nextCheckAt: null,
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
// --- Release-aware scheduling ----------------------------------------------
// Check cadence ramps up as a film's release approaches:
//   > leadDays away        → not checked yet (outside the window)
//   8–10 days (and beyond) → every 3 hours
//   6–7 days               → every 2 hours
//   ≤ 5 days (incl. past)  → every 1 hour
// Films with no known release date default to every 3 hours.

const MIN_3H = 180;
const MIN_2H = 120;
const MIN_1H = 60;

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const rel = new Date(`${dateStr}T00:00:00`);
  if (isNaN(rel)) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((rel - today) / 86400000);
}

/** Minutes between checks for a movie, or null if it's outside its lead window. */
function intervalMinutes(movie) {
  const d = daysUntil(movie.releaseDate);
  const lead = Number.isFinite(movie.leadDays) ? movie.leadDays : DEFAULT_LEAD_DAYS;
  if (d === null) return MIN_3H; // unknown release date
  if (d > lead) return null; // window not open yet
  if (d <= 5) return MIN_1H;
  if (d <= 7) return MIN_2H;
  return MIN_3H; // 8..10 (and >10 if lead is larger)
}

function computeNextCheck(movie) {
  if (movie.status === 'found') return null;
  const iv = intervalMinutes(movie);
  if (iv === null) {
    // Window not open yet: next check is when it opens (release − leadDays).
    if (movie.releaseDate) {
      const open = new Date(`${movie.releaseDate}T00:00:00`);
      open.setDate(open.getDate() - (Number.isFinite(movie.leadDays) ? movie.leadDays : DEFAULT_LEAD_DAYS));
      return open.toISOString();
    }
    return null;
  }
  return new Date(Date.now() + iv * 60000).toISOString();
}

function isDue(movie, now) {
  if (movie.status === 'found') return false;
  const iv = intervalMinutes(movie);
  if (iv === null) return false; // outside lead window
  if (!movie.lastChecked) return true;
  return now - new Date(movie.lastChecked).getTime() >= iv * 60000 - 30000; // 30s slack
}

/**
 * Run the availability check for a single tracked movie and update it in place.
 */
async function checkMovie(movie) {
  try {
    const anyCinema = movie.cinemaId === 'all';
    console.log(`Checking: ${movie.movieName} (${anyCinema ? 'any cinema' : movie.cinemaId})`);

    const result = await odeonScraper.checkFilm(movie.movieName);

    movie.lastChecked = new Date().toISOString();
    movie.filmStatus = result.status;
    if (result.film && result.film.posterUrl) movie.posterUrl = result.film.posterUrl;

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
          releaseDate: movie.releaseDate,
          showings
        });
      }
      console.log(`✓ Bookable: ${movie.movieName} [${result.status}] — ${showings.length} cinema(s) with times`);
    } else {
      if (movie.status !== 'found') movie.status = 'tracking';
      console.log(`… Not bookable yet: ${movie.movieName} [${result.status}]`);
    }
  } catch (error) {
    console.error(`Error checking movie ${movie.movieName}:`, error.message);
  } finally {
    movie.nextCheckAt = computeNextCheck(movie);
  }
}

/**
 * Check every tracked movie now (used by the "Check all now" button).
 */
async function checkTrackedMovies() {
  const movies = loadTrackedMovies();
  console.log(`Checking all ${movies.length} tracked movies...`);
  for (const movie of movies) await checkMovie(movie);
  saveTrackedMovies(movies);
  console.log('Check completed!');
}

/**
 * Scheduler tick: only check movies that are due per their release-aware cadence.
 */
async function checkDueMovies() {
  const movies = loadTrackedMovies();
  const now = Date.now();
  const due = movies.filter((m) => isDue(m, now));
  if (!due.length) return;
  console.log(`⏰ ${due.length} movie(s) due for a check`);
  for (const movie of due) await checkMovie(movie);
  saveTrackedMovies(movies);
}

module.exports = {
  getTrackedMovies,
  addMovie,
  removeMovie,
  getNotifications,
  clearNotifications,
  checkTrackedMovies,
  checkDueMovies,
  // exported for testing
  intervalMinutes,
  daysUntil,
  isDue
};
