const axios = require('axios');
const cheerio = require('cheerio');

// Odeon Ireland API and website URLs
const ODEON_API_BASE = 'https://www.odeoncinemas.ie/api';
const ODEON_WEBSITE = 'https://www.odeoncinemas.ie';

/**
 * Fetch all Odeon cinemas in Dublin
 */
async function getCinemas() {
  try {
    // Try to fetch from Odeon's cinema list API
    const response = await axios.get(`${ODEON_WEBSITE}/cinemas`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 10000
    });

    const $ = cheerio.load(response.data);
    const cinemas = [];

    // Try various selectors for cinema items
    $('article[data-cinema], .cinema-item, [data-cinema-id], .cinema-card').each((i, elem) => {
      const $elem = $(elem);
      const id = $elem.attr('data-cinema') || $elem.attr('data-cinema-id') || $elem.attr('id');
      const name = $elem.find('.cinema-name, h2, h3, .title').text().trim();

      if (id && name && name.toLowerCase().includes('dublin')) {
        cinemas.push({
          id: id,
          name: name,
          address: $elem.find('.cinema-address, .address, .location').text().trim()
        });
      }
    });

    if (cinemas.length > 0) {
      return cinemas;
    }
  } catch (error) {
    console.log('Scraping failed, using default Dublin cinemas:', error.message);
  }

  // Return default Odeon Dublin cinemas
  return [
    { id: 'point-square', name: 'Odeon Point Square', address: 'Point Village, Dublin 1' },
    { id: 'blancharstown', name: 'Odeon Blanchardstown', address: 'Blanchardstown Centre, Dublin 15' },
    { id: 'coolock', name: 'Odeon Coolock', address: 'Northside Shopping Centre, Dublin 5' },
    { id: 'stillorgan', name: 'Odeon Stillorgan', address: 'Stillorgan, Co. Dublin' }
  ];
}

/**
 * Fetch movies for a specific cinema
 */
async function getMovies(cinemaId) {
  try {
    // Try Odeon's movie listings page for the specific cinema
    const response = await axios.get(
      `${ODEON_WEBSITE}/cinemas/${cinemaId}/whats-on`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 10000
      }
    );

    const $ = cheerio.load(response.data);
    const movies = [];

    // Try various selectors for movie items
    $('article[data-film], .film-item, [data-film-id], .movie-card, .film-card').each((i, elem) => {
      const $elem = $(elem);
      const id = $elem.attr('data-film') || $elem.attr('data-film-id') || $elem.attr('id');
      const name = $elem.find('.film-name, .film-title, .movie-title, h2, h3, .title').text().trim();

      if (id && name) {
        const showtimes = $elem.find('.showtime, .session, .performance-time, button[data-session]').length;

        movies.push({
          id: id,
          name: name,
          available: true,
          showtimes: showtimes,
          releaseDate: null
        });
      }
    });

    if (movies.length > 0) {
      return movies;
    }
  } catch (error) {
    console.log('Movies scraping failed, trying alternative method:', error.message);
  }

  // Try API endpoint if available
  try {
    const response = await axios.get(
      `${ODEON_API_BASE}/films/${cinemaId}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 10000
      }
    );

    if (response.data && Array.isArray(response.data)) {
      return response.data.map(film => ({
        id: film.id || film.filmId,
        name: film.title || film.name,
        available: true,
        showtimes: film.performances ? film.performances.length : 0,
        releaseDate: film.releaseDate || null
      }));
    }
  } catch (error) {
    console.log('API fetch failed:', error.message);
  }

  return [];
}

/**
 * Search for a specific movie at a specific cinema
 */
async function searchMovie(movieName, cinemaId) {
  try {
    const movies = await getMovies(cinemaId);
    const searchTerm = movieName.toLowerCase();

    // Search for matching movies
    const matches = movies.filter(movie =>
      movie.name.toLowerCase().includes(searchTerm)
    );

    return {
      found: matches.length > 0,
      movies: matches,
      cinemaId: cinemaId
    };
  } catch (error) {
    console.error('Search failed:', error.message);
    return {
      found: false,
      movies: [],
      error: error.message
    };
  }
}

module.exports = {
  getCinemas,
  getMovies,
  searchMovie
};
