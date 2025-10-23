const express = require('express');
const path = require('path');
const cron = require('node-cron');
const cineworldScraper = require('./scraper/cineworld-scraper');
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
    const cinemas = await cineworldScraper.getCinemas();
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
    const movies = await cineworldScraper.getMovies(cinemaId);
    res.json(movies);
  } catch (error) {
    console.error('Error fetching movies:', error);
    res.status(500).json({ error: 'Failed to fetch movies' });
  }
});

// Search for a specific movie
app.get('/api/search', async (req, res) => {
  try {
    const { movie, cinema } = req.query;
    const results = await cineworldScraper.searchMovie(movie, cinema);
    res.json(results);
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

// Add a movie to track
app.post('/api/track', (req, res) => {
  try {
    const { movieName, cinemaId, cinemaName } = req.body;

    if (!movieName || !cinemaId) {
      return res.status(400).json({ error: 'Movie name and cinema ID are required' });
    }

    const tracked = movieTracker.addMovie(movieName, cinemaId, cinemaName);
    res.json({ success: true, tracked });
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
  console.log(`Cineworld Movie Tracker running on http://localhost:${PORT}`);
  console.log('Scheduled checks will run every 30 minutes');
});
