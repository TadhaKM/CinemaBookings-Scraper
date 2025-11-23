const express = require('express');
const path = require('path');
const cron = require('node-cron');
const odeonScraper = require('./scraper/odeon-scraper');
const movieTracker = require('./services/movie-tracker');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

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

// Search for a specific movie
app.get('/api/search', async (req, res) => {
  try {
    const { movie, cinema } = req.query;
    const results = await odeonScraper.searchMovie(movie, cinema);
    res.json(results);
  } catch (error) {
    console.error('Error searching movie:', error);
    res.status(500).json({ error: 'Failed to search movie' });
  }
});

// Debug endpoint - get all movies at a cinema with full details
app.get('/api/debug/cinema/:cinemaId', async (req, res) => {
  try {
    const { cinemaId } = req.params;
    console.log(`\n========== DEBUG: Fetching movies for ${cinemaId} ==========`);
    const movies = await odeonScraper.getMovies(cinemaId);
    console.log(`========== DEBUG: Found ${movies.length} movies ==========\n`);
    res.json({
      cinemaId,
      movieCount: movies.length,
      movies: movies,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Debug error:', error);
    res.status(500).json({ error: error.message, stack: error.stack });
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
app.post('/api/track', async (req, res) => {
  try {
    const { movieName, cinemaId, cinemaName } = req.body;

    if (!movieName || !cinemaId) {
      return res.status(400).json({ error: 'Movie name and cinema ID are required' });
    }

    const tracked = movieTracker.addMovie(movieName, cinemaId, cinemaName);

    // Immediately check if the movie is available (don't wait 30 minutes)
    console.log(`🔍 Immediately checking availability for: ${movieName} at ${cinemaName}`);
    try {
      await movieTracker.checkTrackedMovies();
      console.log('✓ Initial check completed');
    } catch (checkError) {
      console.error('⚠ Initial check failed:', checkError.message);
      // Don't fail the request if check fails, movie is still tracked
    }

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

// Assignment grading endpoint
app.post('/api/grade', async (req, res) => {
  try {
    const { markingScheme, expectedAnswer, studentCode, expectedOutput } = req.body;

    // Validate required fields
    if (!markingScheme || !expectedAnswer || !studentCode) {
      return res.status(400).json({
        error: 'Missing required fields: markingScheme, expectedAnswer, and studentCode are required'
      });
    }

    // Check if API key is configured
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({
        error: 'ANTHROPIC_API_KEY is not configured. Please set it in your environment variables.'
      });
    }

    // Build the grading prompt
    let prompt = `You are an expert code instructor tasked with grading a student's programming assignment. Please analyze the student's code carefully and provide detailed, constructive feedback.

## Marking Scheme:
${markingScheme}

## Expected Answer/Solution:
${expectedAnswer}

## Student's Code:
${studentCode}`;

    if (expectedOutput) {
      prompt += `

## Expected Output/Behavior:
${expectedOutput}`;
    }

    prompt += `

Please grade this assignment by:
1. Carefully comparing the student's code against the expected answer and marking scheme
2. Identifying what the student did correctly
3. Identifying any mistakes, bugs, or issues
4. Providing specific, constructive feedback on how to improve
5. Assigning a final grade based on the marking scheme

Format your response as follows:
- Start with a summary of the overall quality
- List what was done well
- List what needs improvement with specific examples
- Provide the final grade clearly (e.g., "Final Grade: 85/100" or "Grade: B+")

Be thorough, fair, and constructive in your evaluation.`;

    console.log('Sending grading request to Claude...');

    // Call Claude API
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 4000,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });

    // Extract the response text
    const feedback = message.content[0].text;

    // Extract the grade from the feedback
    const gradeMatch = feedback.match(/(?:Final\s+)?Grade:\s*([^\n]+)/i);
    const grade = gradeMatch ? gradeMatch[1].trim() : 'See feedback for details';

    console.log('Grading completed successfully');

    res.json({
      grade,
      feedback,
      success: true
    });

  } catch (error) {
    console.error('Error grading assignment:', error);

    // Handle API errors specifically
    if (error.status === 401) {
      return res.status(500).json({
        error: 'Invalid API key. Please check your ANTHROPIC_API_KEY.'
      });
    }

    res.status(500).json({
      error: error.message || 'Failed to grade assignment. Please try again.'
    });
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
  console.log(`Odeon Dublin Movie Tracker running on http://localhost:${PORT}`);
  console.log('Scheduled checks will run every 30 minutes');
});
