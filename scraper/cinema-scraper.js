/**
 * Unified Cinema Scraper
 * Routes requests to the appropriate cinema chain scraper
 */

const odeonScraper = require('./odeon-scraper');
const vueScraper = require('./vue-scraper');
const cineworldScraper = require('./cineworld-scraper');

// Map of cinema chains
const CINEMA_CHAINS = {
  odeon: {
    name: 'Odeon',
    scraper: odeonScraper,
    locations: ['blanchardstown', 'coolock', 'point-village', 'stillorgan']
  },
  vue: {
    name: 'Vue',
    scraper: vueScraper,
    locations: ['liffey-valley']
  },
  cineworld: {
    name: 'Cineworld',
    scraper: cineworldScraper,
    locations: ['dublin']
  }
};

/**
 * Get all available cinemas across all chains
 */
async function getAllCinemas() {
  console.log('🎬 Fetching cinemas from all chains...');
  const allCinemas = [];

  for (const [chainId, chain] of Object.entries(CINEMA_CHAINS)) {
    try {
      const cinemas = await chain.scraper.getCinemas();
      // Add chain identifier to each cinema
      const cinemasWithChain = cinemas.map(cinema => ({
        ...cinema,
        chain: chainId,
        chainName: chain.name,
        id: `${chainId}-${cinema.id}`
      }));
      allCinemas.push(...cinemasWithChain);
      console.log(`  ✓ ${chain.name}: ${cinemas.length} cinemas`);
    } catch (error) {
      console.log(`  ⚠ ${chain.name}: ${error.message}`);
    }
  }

  console.log(`✓ Total: ${allCinemas.length} cinemas`);
  return allCinemas;
}

/**
 * Get movies for a specific cinema
 * @param {string} cinemaId - Format: "chain-location" (e.g., "odeon-blanchardstown")
 */
async function getMovies(cinemaId) {
  const { chain, location } = parseCinemaId(cinemaId);

  if (!CINEMA_CHAINS[chain]) {
    throw new Error(`Unknown cinema chain: ${chain}`);
  }

  console.log(`🎬 Fetching movies for ${CINEMA_CHAINS[chain].name} ${location}...`);
  return await CINEMA_CHAINS[chain].scraper.getMovies(location);
}

/**
 * Search for a movie at a specific cinema
 * @param {string} movieName - Movie name to search for
 * @param {string} cinemaId - Format: "chain-location" (e.g., "vue-liffey-valley")
 */
async function searchMovie(movieName, cinemaId) {
  const { chain, location } = parseCinemaId(cinemaId);

  if (!CINEMA_CHAINS[chain]) {
    throw new Error(`Unknown cinema chain: ${chain}`);
  }

  console.log(`🔍 Searching for "${movieName}" at ${CINEMA_CHAINS[chain].name} ${location}`);
  return await CINEMA_CHAINS[chain].scraper.searchMovie(movieName, location);
}

/**
 * Parse cinema ID into chain and location
 * @param {string} cinemaId - Format: "chain-location"
 * @returns {{ chain: string, location: string }}
 */
function parseCinemaId(cinemaId) {
  // Handle both old format (just location) and new format (chain-location)
  if (!cinemaId.includes('-') || Object.keys(CINEMA_CHAINS).every(chain => !cinemaId.startsWith(chain))) {
    // Old format - assume Odeon for backward compatibility
    return { chain: 'odeon', location: cinemaId };
  }

  const parts = cinemaId.split('-');
  const chain = parts[0];
  const location = parts.slice(1).join('-');

  return { chain, location };
}

/**
 * Get list of available cinema chains
 */
function getCinemaChains() {
  return Object.entries(CINEMA_CHAINS).map(([id, chain]) => ({
    id,
    name: chain.name,
    locations: chain.locations
  }));
}

module.exports = {
  getAllCinemas,
  getMovies,
  searchMovie,
  getCinemaChains,
  parseCinemaId
};
