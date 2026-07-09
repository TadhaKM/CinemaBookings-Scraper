/**
 * Mock movie data for local development and demos.
 * Used when FIRECRAWL_API_KEY is not set, or when a Firecrawl scrape fails.
 *
 * Shape matches what firecrawl-scraper produces so the UI behaves identically.
 */

const mockCinemas = [
  { id: 'point-square', name: 'Point Square', address: 'Point Village, Dublin 1' },
  { id: 'blanchardstown', name: 'Blanchardstown', address: 'Blanchardstown Centre, Dublin 15' },
  { id: 'charlestown', name: 'Charlestown', address: "Charlestown Leisure Building, St. Margaret's Road, Dublin 11" },
  { id: 'coolock', name: 'Coolock', address: 'Northside Shopping Centre, Dublin 5' },
  { id: 'stillorgan', name: 'Stillorgan', address: 'Stillorgan, Co. Dublin' }
];

function times(list, format = 'Standard') {
  return list.map((t) => ({ date: 'Today', time: t, format }));
}

const mockMovies = {
  'point-square': [
    {
      id: 'tron-ares',
      name: 'Tron: Ares',
      certificate: '12A',
      releaseDate: '2025-10-10',
      posterUrl: 'https://image.tmdb.org/t/p/w500/lZbCACqE3o4H1CbCbAyMkHYtZBk.jpg',
      showtimes: [...times(['13:00', '16:30', '20:00']), ...times(['15:15', '18:45'], 'IMAX')]
    },
    {
      id: 'wicked',
      name: 'Wicked',
      certificate: 'PG',
      releaseDate: '2024-11-22',
      posterUrl: 'https://image.tmdb.org/t/p/w500/xDGbZ0JJ3mYaGKy4Nzd9Kph6M9L.jpg',
      showtimes: times(['12:30', '15:45', '19:00', '21:30'])
    },
    {
      id: 'nosferatu',
      name: 'Nosferatu',
      certificate: '15',
      releaseDate: '2024-12-25',
      posterUrl: 'https://image.tmdb.org/t/p/w500/5qGIxdEO841C0tdY8vOdLoRVrr0.jpg',
      showtimes: times(['17:15', '20:45'])
    },
    {
      id: 'mufasa-the-lion-king',
      name: 'Mufasa: The Lion King',
      certificate: 'PG',
      releaseDate: '2024-12-20',
      posterUrl: 'https://image.tmdb.org/t/p/w500/lurEK87kukWNaHd0zYnsi3yzJrs.jpg',
      showtimes: times(['11:00', '14:00', '17:00'])
    },
    {
      id: 'sonic-the-hedgehog-3',
      name: 'Sonic the Hedgehog 3',
      certificate: 'PG',
      releaseDate: '2024-12-20',
      posterUrl: 'https://image.tmdb.org/t/p/w500/d8Ryb8AunYAuycVKDp5HpdWPKgC.jpg',
      showtimes: times(['10:45', '13:30', '16:15', '19:15'])
    },
    {
      id: 'gladiator-ii',
      name: 'Gladiator II',
      certificate: '15',
      releaseDate: '2024-11-15',
      posterUrl: 'https://image.tmdb.org/t/p/w500/2cxhvwyEwRlysAmRH4iodkvo0z5.jpg',
      showtimes: times(['18:30', '21:15'])
    }
  ],
  blanchardstown: [
    {
      id: 'tron-ares',
      name: 'Tron: Ares',
      certificate: '12A',
      releaseDate: '2025-10-10',
      posterUrl: 'https://image.tmdb.org/t/p/w500/lZbCACqE3o4H1CbCbAyMkHYtZBk.jpg',
      showtimes: times(['14:00', '17:30', '20:45'])
    },
    {
      id: 'wicked',
      name: 'Wicked',
      certificate: 'PG',
      releaseDate: '2024-11-22',
      posterUrl: 'https://image.tmdb.org/t/p/w500/xDGbZ0JJ3mYaGKy4Nzd9Kph6M9L.jpg',
      showtimes: times(['13:15', '16:30', '19:45'])
    },
    {
      id: 'moana-2',
      name: 'Moana 2',
      certificate: 'PG',
      releaseDate: '2024-11-27',
      posterUrl: 'https://image.tmdb.org/t/p/w500/aLVkiINlIeCkcZIzb7XHzPYgO6L.jpg',
      showtimes: times(['11:30', '14:15', '17:00'])
    }
  ],
  coolock: [
    {
      id: 'wicked',
      name: 'Wicked',
      certificate: 'PG',
      releaseDate: '2024-11-22',
      posterUrl: 'https://image.tmdb.org/t/p/w500/xDGbZ0JJ3mYaGKy4Nzd9Kph6M9L.jpg',
      showtimes: times(['12:00', '15:15', '18:30', '21:00'])
    },
    {
      id: 'sonic-the-hedgehog-3',
      name: 'Sonic the Hedgehog 3',
      certificate: 'PG',
      releaseDate: '2024-12-20',
      posterUrl: 'https://image.tmdb.org/t/p/w500/d8Ryb8AunYAuycVKDp5HpdWPKgC.jpg',
      showtimes: times(['10:30', '13:15', '16:00'])
    }
  ],
  stillorgan: [
    {
      id: 'nosferatu',
      name: 'Nosferatu',
      certificate: '15',
      releaseDate: '2024-12-25',
      posterUrl: 'https://image.tmdb.org/t/p/w500/5qGIxdEO841C0tdY8vOdLoRVrr0.jpg',
      showtimes: times(['18:00', '21:00'])
    },
    {
      id: 'gladiator-ii',
      name: 'Gladiator II',
      certificate: '15',
      releaseDate: '2024-11-15',
      posterUrl: 'https://image.tmdb.org/t/p/w500/2cxhvwyEwRlysAmRH4iodkvo0z5.jpg',
      showtimes: times(['17:45', '20:30'])
    }
  ]
};

function withDerived(movie) {
  return {
    ...movie,
    synopsis: movie.synopsis || null,
    showtimeCount: movie.showtimes.length,
    available: true
  };
}

function getMockCinemas() {
  console.log('📦 Using mock cinema data');
  return mockCinemas;
}

function getMockMovies(cinemaId) {
  console.log(`📦 Using mock movie data for ${cinemaId}`);
  const movies = mockMovies[cinemaId] || mockMovies['point-square'];
  return movies.map(withDerived);
}

module.exports = {
  getMockCinemas,
  getMockMovies,
  mockCinemas,
  mockMovies
};
