// State
let cinemas = [];
let trackedMovies = [];
let notifications = [];

// Initialize the app
document.addEventListener('DOMContentLoaded', async () => {
    await loadCinemas();
    await loadTrackedMovies();
    await loadNotifications();

    // Set up event listeners
    document.getElementById('trackForm').addEventListener('submit', handleTrackMovie);
    document.getElementById('searchBtn').addEventListener('click', handleSearchMovie);
    document.getElementById('checkNowBtn').addEventListener('click', handleCheckNow);
    document.getElementById('clearNotificationsBtn').addEventListener('click', handleClearNotifications);

    // Auto-refresh every 2 minutes
    setInterval(async () => {
        await loadTrackedMovies();
        await loadNotifications();
    }, 120000);
});

// Load cinemas from API
async function loadCinemas() {
    try {
        const response = await fetch('/api/cinemas');
        cinemas = await response.json();

        const select = document.getElementById('cinemaSelect');
        select.innerHTML = '<option value="">Select a cinema</option>';

        cinemas.forEach(cinema => {
            const option = document.createElement('option');
            option.value = cinema.id;
            option.textContent = `${cinema.name}${cinema.address ? ' - ' + cinema.address : ''}`;
            select.appendChild(option);
        });
    } catch (error) {
        console.error('Error loading cinemas:', error);
        showToast('Failed to load cinemas', 'error');
    }
}

// Load tracked movies
async function loadTrackedMovies() {
    try {
        const response = await fetch('/api/tracked');
        trackedMovies = await response.json();
        renderTrackedMovies();
    } catch (error) {
        console.error('Error loading tracked movies:', error);
    }
}

// Load notifications
async function loadNotifications() {
    try {
        const response = await fetch('/api/notifications');
        notifications = await response.json();
        renderNotifications();
        updateNotificationBadge();
    } catch (error) {
        console.error('Error loading notifications:', error);
    }
}

// Handle track movie form submission
async function handleTrackMovie(e) {
    e.preventDefault();

    const movieName = document.getElementById('movieName').value.trim();
    const cinemaId = document.getElementById('cinemaSelect').value;

    if (!movieName || !cinemaId) {
        showToast('Please fill in all fields', 'error');
        return;
    }

    const cinema = cinemas.find(c => c.id === cinemaId);

    try {
        const response = await fetch('/api/track', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                movieName,
                cinemaId,
                cinemaName: cinema ? cinema.name : 'Unknown'
            })
        });

        const data = await response.json();

        if (data.success) {
            showToast('Movie added to tracking!', 'success');
            document.getElementById('trackForm').reset();
            await loadTrackedMovies();
        } else {
            showToast('Failed to track movie', 'error');
        }
    } catch (error) {
        console.error('Error tracking movie:', error);
        showToast('Failed to track movie', 'error');
    }
}

// Handle search movie
async function handleSearchMovie() {
    const movieName = document.getElementById('movieName').value.trim();
    const cinemaId = document.getElementById('cinemaSelect').value;

    if (!movieName || !cinemaId) {
        showToast('Please fill in all fields', 'error');
        return;
    }

    const resultsDiv = document.getElementById('searchResults');
    resultsDiv.style.display = 'block';
    resultsDiv.innerHTML = '<p>Searching...</p>';

    try {
        const response = await fetch(`/api/search?movie=${encodeURIComponent(movieName)}&cinema=${cinemaId}`);
        const data = await response.json();

        if (data.found && data.movies.length > 0) {
            resultsDiv.innerHTML = `
                <h3>Found ${data.movies.length} result(s):</h3>
                ${data.movies.map(movie => `
                    <div class="search-result-item">
                        <strong>${movie.name}</strong><br>
                        ${movie.showtimes} showtime(s) available
                        ${movie.releaseDate ? `<br>Release date: ${new Date(movie.releaseDate).toLocaleDateString()}` : ''}
                    </div>
                `).join('')}
            `;
        } else {
            resultsDiv.innerHTML = '<p>No results found. The movie might not be available yet.</p>';
        }
    } catch (error) {
        console.error('Error searching:', error);
        resultsDiv.innerHTML = '<p>Error searching. Please try again.</p>';
    }
}

// Handle check now button
async function handleCheckNow() {
    const btn = document.getElementById('checkNowBtn');
    btn.disabled = true;
    btn.textContent = 'Checking...';

    try {
        const response = await fetch('/api/check', { method: 'POST' });
        const data = await response.json();

        if (data.success) {
            showToast('Check completed!', 'success');
            await loadTrackedMovies();
            await loadNotifications();
        } else {
            showToast('Check failed', 'error');
        }
    } catch (error) {
        console.error('Error checking:', error);
        showToast('Check failed', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Check All Now';
    }
}

// Handle clear notifications
async function handleClearNotifications() {
    try {
        const response = await fetch('/api/notifications', { method: 'DELETE' });
        const data = await response.json();

        if (data.success) {
            showToast('Notifications cleared', 'success');
            await loadNotifications();
        }
    } catch (error) {
        console.error('Error clearing notifications:', error);
        showToast('Failed to clear notifications', 'error');
    }
}

// Remove tracked movie
async function removeTrackedMovie(id) {
    if (!confirm('Are you sure you want to stop tracking this movie?')) {
        return;
    }

    try {
        const response = await fetch(`/api/track/${id}`, { method: 'DELETE' });
        const data = await response.json();

        if (data.success) {
            showToast('Movie removed from tracking', 'success');
            await loadTrackedMovies();
        }
    } catch (error) {
        console.error('Error removing movie:', error);
        showToast('Failed to remove movie', 'error');
    }
}

// Render tracked movies
function renderTrackedMovies() {
    const container = document.getElementById('trackedMovies');

    if (trackedMovies.length === 0) {
        container.innerHTML = '<p class="empty-state">No movies tracked yet. Add one above!</p>';
        return;
    }

    container.innerHTML = trackedMovies.map(movie => `
        <div class="tracked-item">
            <div class="tracked-item-header">
                <div>
                    <div class="movie-name">${movie.movieName}</div>
                    <div class="cinema-name">${movie.cinemaName}</div>
                </div>
                <div>
                    <span class="status-badge status-${movie.status}">${movie.status.toUpperCase()}</span>
                </div>
            </div>
            <div class="movie-info">
                Added: ${new Date(movie.addedAt).toLocaleDateString()} ${new Date(movie.addedAt).toLocaleTimeString()}
                ${movie.lastChecked ? `<br>Last checked: ${new Date(movie.lastChecked).toLocaleString()}` : ''}
                ${movie.foundAt ? `<br>Found at: ${new Date(movie.foundAt).toLocaleString()}` : ''}
            </div>
            <button class="btn btn-danger btn-sm" onclick="removeTrackedMovie('${movie.id}')" style="margin-top: 10px;">
                Remove
            </button>
        </div>
    `).join('');
}

// Render notifications
function renderNotifications() {
    const container = document.getElementById('notifications');

    if (notifications.length === 0) {
        container.innerHTML = '<p class="empty-state">No notifications yet.</p>';
        return;
    }

    container.innerHTML = notifications.map(notif => `
        <div class="notification-item">
            <div class="notification-message">${notif.message}</div>
            ${notif.details ? `
                <div class="notification-details">
                    ${notif.details.showtimes ? `${notif.details.showtimes} showtime(s) available` : ''}
                </div>
            ` : ''}
            <div class="notification-time">${new Date(notif.createdAt).toLocaleString()}</div>
        </div>
    `).join('');
}

// Update notification badge
function updateNotificationBadge() {
    const badge = document.getElementById('notificationsBadge');
    const count = document.getElementById('notificationCount');

    if (notifications.length > 0) {
        badge.style.display = 'block';
        count.textContent = notifications.length;
    } else {
        badge.style.display = 'none';
    }
}

// Show toast notification
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type}`;
    toast.classList.add('show');

    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}
