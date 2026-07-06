require('dotenv').config();

const express = require('express');
const cron = require('node-cron');
const odeonScraper = require('./scraper/odeon-scraper');
const movieTracker = require('./services/movie-tracker');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static('public'));

// API Routes

// Get all cinemas
app.get('/api/cinemas', async (req, res) => {
  try {
    const cinemas = await odeonScraper.getCinemas();
    res.json(cinemas);
  } catch (error) {
    console.error('Error fetching cinemas:', error);
    res.status(500).json({ error: 'Failed to fetch cinemas' });
  }
});

// Get movies for a specific cinema
app.get('/api/cinemas/:cinemaId/movies', async (req, res) => {
  try {
    const { cinemaId } = req.params;
    const movies = await odeonScraper.getMovies(cinemaId);
    res.json(movies);
  } catch (error) {
    console.error('Error fetching movies:', error);
    res.status(500).json({ error: 'Failed to fetch movies' });
  }
});

// Search for a film: returns its ODEON status (now showing / pre-book / coming
// soon) plus which of the requested cinemas currently have showtimes.
// Query: movie=<title>&cinemas=<id,id>|all=true
app.get('/api/search', async (req, res) => {
  try {
    const { movie, cinemas, cinema, all } = req.query;
    if (!movie) return res.status(400).json({ error: 'movie is required' });

    const wantAll = all === 'true' || (cinemas ? String(cinemas).split(',').includes('all') : false);
    const cinemaIds = cinemas
      ? String(cinemas).split(',').filter((c) => c && c !== 'all')
      : cinema
        ? [cinema]
        : [];

    const targets = wantAll ? [] : await odeonScraper.resolveCinemas({ cinemaIds });
    const result = await odeonScraper.checkFilmDetailed(movie, targets, { all: wantAll });
    res.json(result);
  } catch (error) {
    console.error('Error searching movie:', error);
    res.status(500).json({ error: 'Failed to search movie' });
  }
});

// Get all tracked movies
app.get('/api/tracked', (req, res) => {
  try {
    const tracked = movieTracker.getTrackedMovies();
    res.json(tracked);
  } catch (error) {
    console.error('Error getting tracked movies:', error);
    res.status(500).json({ error: 'Failed to get tracked movies' });
  }
});

// Add a film to track — at one or more cinemas, or "any" ODEON Dublin cinema.
// Body: { movieName, all?: bool, cinemaIds?: string[], cinemaId?: string }
app.post('/api/track', async (req, res) => {
  try {
    const { movieName, all, cinemaIds, cinemaId } = req.body;
    if (!movieName) {
      return res.status(400).json({ error: 'movieName is required' });
    }

    const wantAll =
      all === true || (Array.isArray(cinemaIds) && cinemaIds.includes('all')) || cinemaId === 'all';

    let entries;
    if (wantAll) {
      entries = [{ id: 'all', name: 'Any ODEON Dublin cinema' }];
    } else {
      entries = await odeonScraper.resolveCinemas({
        cinemaIds: Array.isArray(cinemaIds) ? cinemaIds : cinemaId ? [cinemaId] : []
      });
      if (!entries.length) {
        return res.status(400).json({ error: 'Select at least one cinema (or choose "any")' });
      }
    }

    const added = entries.map((e) => movieTracker.addMovie(movieName, e.id, e.name));

    // Kick off an availability check in the background so the request returns fast.
    console.log(`🔍 Tracking "${movieName}" at ${entries.map((e) => e.name).join(', ')}`);
    movieTracker
      .checkTrackedMovies()
      .then(() => console.log('✓ Background check completed'))
      .catch((err) => console.error('⚠ Background check failed:', err.message));

    res.json({ success: true, added });
  } catch (error) {
    console.error('Error tracking movie:', error);
    res.status(500).json({ error: 'Failed to track movie' });
  }
});

// Remove a tracked movie
app.delete('/api/track/:id', (req, res) => {
  try {
    const { id } = req.params;
    movieTracker.removeMovie(id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error removing tracked movie:', error);
    res.status(500).json({ error: 'Failed to remove tracked movie' });
  }
});

// Get notifications
app.get('/api/notifications', (req, res) => {
  try {
    const notifications = movieTracker.getNotifications();
    res.json(notifications);
  } catch (error) {
    console.error('Error getting notifications:', error);
    res.status(500).json({ error: 'Failed to get notifications' });
  }
});

// Clear notifications
app.delete('/api/notifications', (req, res) => {
  try {
    movieTracker.clearNotifications();
    res.json({ success: true });
  } catch (error) {
    console.error('Error clearing notifications:', error);
    res.status(500).json({ error: 'Failed to clear notifications' });
  }
});

// Schedule periodic checks every 30 minutes
cron.schedule('*/30 * * * *', async () => {
  console.log('Running scheduled movie check...');
  try {
    await movieTracker.checkTrackedMovies();
  } catch (error) {
    console.error('Error in scheduled check:', error);
  }
});

// Manual check endpoint
app.post('/api/check', async (req, res) => {
  try {
    console.log('Running manual movie check...');
    await movieTracker.checkTrackedMovies();
    res.json({ success: true, message: 'Check completed' });
  } catch (error) {
    console.error('Error in manual check:', error);
    res.status(500).json({ error: 'Failed to check movies' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🎬 Odeon Dublin Movie Tracker running on http://localhost:${PORT}`);
  console.log('⏰ Scheduled checks will run every 30 minutes');
  if (process.env.FIRECRAWL_API_KEY) {
    console.log('🔥 Firecrawl: enabled');
  } else {
    console.log('📦 Firecrawl: not configured — using mock data (set FIRECRAWL_API_KEY in .env)');
  }
});
