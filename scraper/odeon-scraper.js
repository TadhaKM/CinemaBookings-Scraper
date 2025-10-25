const axios = require('axios');
const cheerio = require('cheerio');
const Fuse = require('fuse.js');
const { getMockCinemas, getMockMovies } = require('./mock-data');
const puppeteerScraper = require('./puppeteer-scraper');
const { getMovieShowtimes } = require('./puppeteer-scraper-simple');

// Odeon Ireland API and website URLs
const ODEON_WEBSITE = 'https://www.odeoncinemas.ie';

// Configuration: Use Puppeteer for real scraping or mock data
const USE_PUPPETEER = process.env.USE_PUPPETEER === 'true';

/**
 * Fetch all Odeon cinemas in Dublin
 */
async function getCinemas() {
  console.log('🎬 Fetching Odeon Dublin cinemas...');

  // Try Puppeteer first if enabled
  if (USE_PUPPETEER) {
    console.log('Using Puppeteer for real scraping...');
    try {
      const cinemas = await puppeteerScraper.scrapeCinemas();
      if (cinemas && cinemas.length > 0) {
        return cinemas;
      }
    } catch (error) {
      console.log('⚠ Puppeteer scraping failed, trying fallback methods...');
    }
  }

  try {
    // Try to fetch cinema data from various endpoints
    const endpoints = [
      `${ODEON_WEBSITE}/cinemas/`,
      `${ODEON_WEBSITE}/api/cinemas`,
      `${ODEON_WEBSITE}/cinemas.json`
    ];

    for (const endpoint of endpoints) {
      try {
        console.log(`Trying endpoint: ${endpoint}`);
        const response = await axios.get(endpoint, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Referer': 'https://www.odeoncinemas.ie/',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'same-origin',
            'Cache-Control': 'max-age=0'
          },
          timeout: 15000
        });

        // Try JSON response first
        if (response.headers['content-type']?.includes('application/json')) {
          console.log('Got JSON response');
          const data = response.data;
          if (Array.isArray(data)) {
            const dublinCinemas = data
              .filter(c => c.name?.toLowerCase().includes('dublin'))
              .map(c => ({
                id: c.id || c.cinema_id || c.slug,
                name: c.name,
                address: c.address || c.location || ''
              }));

            if (dublinCinemas.length > 0) {
              console.log(`✓ Found ${dublinCinemas.length} Dublin cinemas via JSON`);
              return dublinCinemas;
            }
          }
        }

        // Try HTML scraping
        const $ = cheerio.load(response.data);
        const cinemas = [];

        // Try multiple selectors
        const selectors = [
          'article[data-cinema-id]',
          '[data-cinema]',
          '.cinema-item',
          '.cinema-card',
          'a[href*="/cinemas/"]'
        ];

        for (const selector of selectors) {
          $(selector).each((i, elem) => {
            const $elem = $(elem);
            const id = $elem.attr('data-cinema-id') ||
                      $elem.attr('data-cinema') ||
                      $elem.attr('href')?.split('/').pop() ||
                      $elem.attr('id');
            const name = $elem.find('h2, h3, .cinema-name, .title').first().text().trim() ||
                        $elem.text().trim();

            if (id && name && name.toLowerCase().includes('dublin') && name.length < 100) {
              cinemas.push({
                id: id,
                name: name,
                address: $elem.find('.address, .location, .cinema-address').text().trim()
              });
            }
          });

          if (cinemas.length > 0) {
            console.log(`✓ Found ${cinemas.length} cinemas using selector: ${selector}`);
            return [...new Map(cinemas.map(c => [c.id, c])).values()]; // Remove duplicates
          }
        }
      } catch (err) {
        console.log(`Failed ${endpoint}:`, err.message);
        continue;
      }
    }
  } catch (error) {
    console.log('⚠ All API/scraping attempts failed, using default cinemas');
  }

  // Return mock cinemas as fallback
  return getMockCinemas();
}

/**
 * Fetch movies for a specific cinema
 */
async function getMovies(cinemaId) {
  console.log(`🎬 Fetching movies for cinema: ${cinemaId}`);

  // Try Puppeteer first if enabled
  if (USE_PUPPETEER) {
    console.log('Using Puppeteer for real scraping...');
    try {
      const movies = await puppeteerScraper.scrapeMovies(cinemaId);
      if (movies && movies.length > 0) {
        return movies;
      }
    } catch (error) {
      console.log('⚠ Puppeteer scraping failed, trying fallback methods...');
    }
  }

  try {
    // Try multiple URL patterns for Odeon
    const urls = [
      `${ODEON_WEBSITE}/cinemas/${cinemaId}/whats-on`,
      `${ODEON_WEBSITE}/cinemas/${cinemaId}`,
      `${ODEON_WEBSITE}/${cinemaId}/films`,
      `${ODEON_WEBSITE}/api/v1/cinemas/${cinemaId}/films`,
      `${ODEON_WEBSITE}/films?cinema=${cinemaId}`
    ];

    for (const url of urls) {
      try {
        console.log(`Trying URL: ${url}`);
        const response = await axios.get(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Referer': 'https://www.odeoncinemas.ie/',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'same-origin',
            'Cache-Control': 'max-age=0'
          },
          timeout: 15000
        });

        console.log(`Response status: ${response.status}, Content-Type: ${response.headers['content-type']}`);

        // Try JSON response
        if (response.headers['content-type']?.includes('application/json')) {
          const data = response.data;
          console.log('Got JSON response');

          let films = [];
          if (Array.isArray(data)) {
            films = data;
          } else if (data.films) {
            films = data.films;
          } else if (data.data?.films) {
            films = data.data.films;
          }

          if (films.length > 0) {
            console.log(`✓ Found ${films.length} movies via JSON`);
            return films.map(film => ({
              id: film.id || film.film_id || film.slug,
              name: film.title || film.name || film.film_name,
              available: true,
              showtimes: film.performances?.length || film.showtimes?.length || 0,
              releaseDate: film.release_date || film.releaseDate || null
            }));
          }
        }

        // Try HTML scraping
        const $ = cheerio.load(response.data);
        const movies = [];

        // Enhanced selectors for movie items
        const selectors = [
          'article[data-film-id]',
          '[data-film]',
          '.film-item',
          '.film-card',
          '.movie-card',
          'article.film',
          'div[data-movie-id]',
          'a[href*="/films/"]'
        ];

        for (const selector of selectors) {
          $(selector).each((i, elem) => {
            const $elem = $(elem);
            const id = $elem.attr('data-film-id') ||
                      $elem.attr('data-film') ||
                      $elem.attr('data-movie-id') ||
                      $elem.attr('href')?.split('/').pop() ||
                      `film-${i}`;

            const name = $elem.find('h2, h3, h4, .film-title, .film-name, .movie-title, .title').first().text().trim() ||
                        $elem.attr('title') ||
                        $elem.attr('aria-label');

            if (name && name.length > 0 && name.length < 200) {
              const showtimes = $elem.find('[data-session-id], .showtime, .session, .performance-time, button[data-performance]').length;

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
            console.log(`✓ Found ${movies.length} movies using selector: ${selector}`);
            // Remove duplicates based on name
            const uniqueMovies = [...new Map(movies.map(m => [m.name.toLowerCase(), m])).values()];
            console.log(`Movies found: ${uniqueMovies.map(m => m.name).join(', ')}`);
            return uniqueMovies;
          }
        }

        console.log(`No movies found with any selector at ${url}`);
      } catch (err) {
        console.log(`Failed ${url}:`, err.message);
        continue;
      }
    }
  } catch (error) {
    console.error('⚠ All movie fetch attempts failed:', error.message);
  }

  // Return mock movies as fallback
  return getMockMovies(cinemaId);
}

/**
 * Search for a specific movie at a specific cinema using fuzzy matching
 */
async function searchMovie(movieName, cinemaId) {
  console.log(`🔍 Searching for "${movieName}" at cinema ${cinemaId}`);

  try {
    const movies = await getMovies(cinemaId);

    if (movies.length === 0) {
      console.log('⚠ No movies found at this cinema');
      return {
        found: false,
        movies: [],
        error: 'No movies found at this cinema. The cinema may not have any current showings, or the scraper needs updating.'
      };
    }

    console.log(`Searching through ${movies.length} movies for "${movieName}"`);

    // Use Fuse.js for fuzzy matching (AI-like smart matching)
    const fuse = new Fuse(movies, {
      keys: ['name'],
      threshold: 0.4, // 0 = perfect match, 1 = match anything
      includeScore: true,
      ignoreLocation: true,
      minMatchCharLength: 2
    });

    const results = fuse.search(movieName);

    if (results.length > 0) {
      const matches = results
        .filter(result => result.score < 0.5) // Only good matches
        .map(result => ({
          ...result.item,
          matchScore: result.score // Lower score = better match
        }));

      console.log(`✓ Found ${matches.length} matches using fuzzy search`);
      matches.forEach(m => console.log(`  - "${m.name}" (score: ${m.matchScore.toFixed(3)})`));

      // NOW fetch showtimes for ONLY the best match (much faster!)
      if (matches.length > 0 && USE_PUPPETEER && matches[0].url) {
        try {
          const showtimes = await getMovieShowtimes(matches[0].url, cinemaId);
          matches[0].showtimes = showtimes;
          matches[0].showtimeCount = showtimes.length;
        } catch (error) {
          console.log(`⚠ Could not fetch showtimes: ${error.message}`);
        }
      }

      return {
        found: matches.length > 0,
        movies: matches,
        cinemaId: cinemaId,
        searchMethod: 'fuzzy-matching'
      };
    }

    // Fallback: simple substring matching
    const searchTerm = movieName.toLowerCase();
    const matches = movies.filter(movie =>
      movie.name.toLowerCase().includes(searchTerm) ||
      searchTerm.includes(movie.name.toLowerCase())
    );

    if (matches.length > 0) {
      console.log(`✓ Found ${matches.length} matches using substring search`);
    } else {
      console.log(`✗ No matches found for "${movieName}"`);
      console.log(`Available movies: ${movies.map(m => m.name).join(', ')}`);
    }

    return {
      found: matches.length > 0,
      movies: matches,
      cinemaId: cinemaId,
      searchMethod: 'substring',
      availableMovies: movies.map(m => m.name) // Include for debugging
    };
  } catch (error) {
    console.error('⚠ Search failed:', error.message);
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
