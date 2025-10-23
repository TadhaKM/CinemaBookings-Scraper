const axios = require('axios');
const cheerio = require('cheerio');

// Cineworld API base URL (they have a public API for their website)
const CINEWORLD_API_BASE = 'https://www.cineworld.co.uk/uk/data-api-service/v1';
const CINEWORLD_WEBSITE = 'https://www.cineworld.co.uk';

/**
 * Fetch all Cineworld cinemas
 */
async function getCinemas() {
  try {
    // Try API endpoint first
    const response = await axios.get(`${CINEWORLD_API_BASE}/quickbook/10108/cinemas/with-event/until/2025-12-31`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 10000
    });

    if (response.data && response.data.body && response.data.body.cinemas) {
      return response.data.body.cinemas.map(cinema => ({
        id: cinema.id,
        name: cinema.name,
        address: cinema.address || ''
      }));
    }
  } catch (error) {
    console.log('API fetch failed, trying alternative method:', error.message);
  }

  // Fallback to scraping if API fails
  try {
    const response = await axios.get(`${CINEWORLD_WEBSITE}/cinemas`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 10000
    });

    const $ = cheerio.load(response.data);
    const cinemas = [];

    // Parse cinema list from HTML
    $('.cinema-item, [data-cinema-id]').each((i, elem) => {
      const $elem = $(elem);
      const id = $elem.attr('data-cinema-id') || $elem.attr('id');
      const name = $elem.find('.cinema-name, h2, h3').text().trim();

      if (id && name) {
        cinemas.push({
          id: id,
          name: name,
          address: $elem.find('.cinema-address, .address').text().trim()
        });
      }
    });

    if (cinemas.length > 0) {
      return cinemas;
    }
  } catch (error) {
    console.error('Scraping failed:', error.message);
  }

  // Return some default cinemas if all else fails
  return [
    { id: '3', name: 'Cineworld London Leicester Square', address: 'London' },
    { id: '4', name: 'Cineworld Birmingham Broad Street', address: 'Birmingham' },
    { id: '6', name: 'Cineworld Glasgow Renfrew Street', address: 'Glasgow' },
    { id: '8', name: 'Cineworld Manchester', address: 'Manchester' }
  ];
}

/**
 * Fetch movies for a specific cinema
 */
async function getMovies(cinemaId) {
  try {
    const today = new Date().toISOString().split('T')[0];
    const response = await axios.get(
      `${CINEWORLD_API_BASE}/quickbook/10108/film-events/in-cinema/${cinemaId}/at-date/${today}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 10000
      }
    );

    if (response.data && response.data.body && response.data.body.films) {
      return response.data.body.films.map(film => ({
        id: film.id,
        name: film.name,
        available: true,
        showtimes: film.events ? film.events.length : 0,
        releaseDate: film.release_date || null
      }));
    }
  } catch (error) {
    console.log('Movies API fetch failed:', error.message);
  }

  // Fallback scraping method
  try {
    const response = await axios.get(
      `${CINEWORLD_WEBSITE}/cinemas/${cinemaId}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 10000
      }
    );

    const $ = cheerio.load(response.data);
    const movies = [];

    $('.film-item, [data-film-id]').each((i, elem) => {
      const $elem = $(elem);
      const id = $elem.attr('data-film-id') || $elem.attr('id');
      const name = $elem.find('.film-name, h2, h3, .title').text().trim();

      if (id && name) {
        movies.push({
          id: id,
          name: name,
          available: true,
          showtimes: $elem.find('.showtime, .session').length
        });
      }
    });

    return movies;
  } catch (error) {
    console.error('Movies scraping failed:', error.message);
    return [];
  }
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
