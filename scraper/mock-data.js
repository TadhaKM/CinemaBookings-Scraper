/**
 * Mock movie data for testing and demo purposes
 * Used when real scraping fails due to 403 errors or other issues
 */

const mockCinemas = [
  { id: 'point-square', name: 'Odeon Point Square', address: 'Point Village, Dublin 1' },
  { id: 'blanchardstown', name: 'Odeon Blanchardstown', address: 'Blanchardstown Centre, Dublin 15' },
  { id: 'coolock', name: 'Odeon Coolock', address: 'Northside Shopping Centre, Dublin 5' },
  { id: 'stillorgan', name: 'Odeon Stillorgan', address: 'Stillorgan, Co. Dublin' }
];

// Realistic current movies for different cinemas
const mockMovies = {
  'point-square': [
    { id: 'tron-ares', name: 'Tron: Ares', available: true, showtimes: 8, releaseDate: '2025-10-10' },
    { id: 'wicked', name: 'Wicked', available: true, showtimes: 12, releaseDate: '2024-11-22' },
    { id: 'nosferatu', name: 'Nosferatu', available: true, showtimes: 6, releaseDate: '2024-12-25' },
    { id: 'mufasa', name: 'Mufasa: The Lion King', available: true, showtimes: 10, releaseDate: '2024-12-20' },
    { id: 'sonic-3', name: 'Sonic the Hedgehog 3', available: true, showtimes: 9, releaseDate: '2024-12-20' },
    { id: 'paddington', name: 'Paddington in Peru', available: true, showtimes: 7, releaseDate: '2024-11-08' },
    { id: 'moana-2', name: 'Moana 2', available: true, showtimes: 11, releaseDate: '2024-11-27' },
    { id: 'gladiator-2', name: 'Gladiator II', available: true, showtimes: 8, releaseDate: '2024-11-15' },
    { id: 'red-one', name: 'Red One', available: true, showtimes: 5, releaseDate: '2024-11-15' },
    { id: 'kraven', name: 'Kraven the Hunter', available: true, showtimes: 6, releaseDate: '2024-12-13' }
  ],
  'blanchardstown': [
    { id: 'tron-ares', name: 'Tron: Ares', available: true, showtimes: 6, releaseDate: '2025-10-10' },
    { id: 'wicked', name: 'Wicked', available: true, showtimes: 10, releaseDate: '2024-11-22' },
    { id: 'nosferatu', name: 'Nosferatu', available: true, showtimes: 5, releaseDate: '2024-12-25' },
    { id: 'sonic-3', name: 'Sonic the Hedgehog 3', available: true, showtimes: 8, releaseDate: '2024-12-20' },
    { id: 'moana-2', name: 'Moana 2', available: true, showtimes: 9, releaseDate: '2024-11-27' },
    { id: 'gladiator-2', name: 'Gladiator II', available: true, showtimes: 7, releaseDate: '2024-11-15' },
    { id: 'paddington', name: 'Paddington in Peru', available: true, showtimes: 6, releaseDate: '2024-11-08' }
  ],
  'coolock': [
    { id: 'tron-ares', name: 'Tron: Ares', available: true, showtimes: 7, releaseDate: '2025-10-10' },
    { id: 'wicked', name: 'Wicked', available: true, showtimes: 11, releaseDate: '2024-11-22' },
    { id: 'mufasa', name: 'Mufasa: The Lion King', available: true, showtimes: 9, releaseDate: '2024-12-20' },
    { id: 'sonic-3', name: 'Sonic the Hedgehog 3', available: true, showtimes: 10, releaseDate: '2024-12-20' },
    { id: 'moana-2', name: 'Moana 2', available: true, showtimes: 8, releaseDate: '2024-11-27' },
    { id: 'red-one', name: 'Red One', available: true, showtimes: 4, releaseDate: '2024-11-15' }
  ],
  'stillorgan': [
    { id: 'tron-ares', name: 'Tron: Ares', available: true, showtimes: 5, releaseDate: '2025-10-10' },
    { id: 'wicked', name: 'Wicked', available: true, showtimes: 9, releaseDate: '2024-11-22' },
    { id: 'nosferatu', name: 'Nosferatu', available: true, showtimes: 4, releaseDate: '2024-12-25' },
    { id: 'gladiator-2', name: 'Gladiator II', available: true, showtimes: 6, releaseDate: '2024-11-15' },
    { id: 'paddington', name: 'Paddington in Peru', available: true, showtimes: 5, releaseDate: '2024-11-08' },
    { id: 'kraven', name: 'Kraven the Hunter', available: true, showtimes: 5, releaseDate: '2024-12-13' }
  ]
};

function getMockCinemas() {
  console.log('📦 Using mock cinema data (real scraping blocked by 403)');
  return mockCinemas;
}

function getMockMovies(cinemaId) {
  console.log(`📦 Using mock movie data for ${cinemaId} (real scraping blocked by 403)`);
  const movies = mockMovies[cinemaId] || mockMovies['point-square'];
  console.log(`   Mock movies: ${movies.map(m => m.name).join(', ')}`);
  return movies;
}

module.exports = {
  getMockCinemas,
  getMockMovies,
  mockCinemas,
  mockMovies
};
