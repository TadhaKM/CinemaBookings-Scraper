const { createApp } = Vue;

createApp({
  data() {
    return {
      cinemas: [],
      trackedMovies: [],
      notifications: [],
      checking: false,
      form: {
        movieName: '',
        cinemaId: ''
      },
      searchResults: {
        visible: false,
        loading: false,
        found: false,
        movies: []
      },
      toast: {
        visible: false,
        message: '',
        type: 'success'
      }
    };
  },

  async mounted() {
    await this.loadCinemas();
    await this.loadTrackedMovies();
    await this.loadNotifications();

    // Auto-refresh every 2 minutes
    setInterval(async () => {
      await this.loadTrackedMovies();
      await this.loadNotifications();
    }, 120000);
  },

  methods: {
    // Load cinemas from API
    async loadCinemas() {
      try {
        const response = await fetch('/api/cinemas');
        this.cinemas = await response.json();
      } catch (error) {
        console.error('Error loading cinemas:', error);
        this.showToast('Failed to load cinemas', 'error');
      }
    },

    // Load tracked movies
    async loadTrackedMovies() {
      try {
        const response = await fetch('/api/tracked');
        this.trackedMovies = await response.json();
      } catch (error) {
        console.error('Error loading tracked movies:', error);
      }
    },

    // Load notifications
    async loadNotifications() {
      try {
        const response = await fetch('/api/notifications');
        this.notifications = await response.json();
      } catch (error) {
        console.error('Error loading notifications:', error);
      }
    },

    // Track a new movie
    async trackMovie() {
      if (!this.form.movieName || !this.form.cinemaId) {
        this.showToast('Please fill in all fields', 'error');
        return;
      }

      const cinema = this.cinemas.find(c => c.id === this.form.cinemaId);

      try {
        const response = await fetch('/api/track', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            movieName: this.form.movieName,
            cinemaId: this.form.cinemaId,
            cinemaName: cinema ? cinema.name : 'Unknown'
          })
        });

        const data = await response.json();

        if (data.success) {
          this.showToast('Movie added to tracking!', 'success');
          this.form.movieName = '';
          this.form.cinemaId = '';
          this.searchResults.visible = false;
          await this.loadTrackedMovies();
        } else {
          this.showToast('Failed to track movie', 'error');
        }
      } catch (error) {
        console.error('Error tracking movie:', error);
        this.showToast('Failed to track movie', 'error');
      }
    },

    // Search for a movie
    async searchMovie() {
      if (!this.form.movieName || !this.form.cinemaId) {
        this.showToast('Please fill in all fields', 'error');
        return;
      }

      this.searchResults.visible = true;
      this.searchResults.loading = true;
      this.searchResults.found = false;
      this.searchResults.movies = [];

      try {
        const response = await fetch(
          `/api/search?movie=${encodeURIComponent(this.form.movieName)}&cinema=${this.form.cinemaId}`
        );
        const data = await response.json();

        this.searchResults.loading = false;
        this.searchResults.found = data.found && data.movies.length > 0;
        this.searchResults.movies = data.movies || [];
      } catch (error) {
        console.error('Error searching:', error);
        this.searchResults.loading = false;
        this.showToast('Search failed', 'error');
      }
    },

    // Check all movies now
    async checkAllMovies() {
      this.checking = true;

      try {
        const response = await fetch('/api/check', { method: 'POST' });
        const data = await response.json();

        if (data.success) {
          this.showToast('Check completed!', 'success');
          await this.loadTrackedMovies();
          await this.loadNotifications();
        } else {
          this.showToast('Check failed', 'error');
        }
      } catch (error) {
        console.error('Error checking:', error);
        this.showToast('Check failed', 'error');
      } finally {
        this.checking = false;
      }
    },

    // Remove a tracked movie
    async removeMovie(id) {
      if (!confirm('Are you sure you want to stop tracking this movie?')) {
        return;
      }

      try {
        const response = await fetch(`/api/track/${id}`, { method: 'DELETE' });
        const data = await response.json();

        if (data.success) {
          this.showToast('Movie removed from tracking', 'success');
          await this.loadTrackedMovies();
        }
      } catch (error) {
        console.error('Error removing movie:', error);
        this.showToast('Failed to remove movie', 'error');
      }
    },

    // Clear all notifications
    async clearNotifications() {
      try {
        const response = await fetch('/api/notifications', { method: 'DELETE' });
        const data = await response.json();

        if (data.success) {
          this.showToast('Notifications cleared', 'success');
          await this.loadNotifications();
        }
      } catch (error) {
        console.error('Error clearing notifications:', error);
        this.showToast('Failed to clear notifications', 'error');
      }
    },

    // Show toast notification
    showToast(message, type = 'success') {
      this.toast.message = message;
      this.toast.type = type;
      this.toast.visible = true;

      setTimeout(() => {
        this.toast.visible = false;
      }, 3000);
    },

    // Format date
    formatDate(dateString) {
      if (!dateString) return '';
      return new Date(dateString).toLocaleDateString();
    },

    // Format date and time
    formatDateTime(dateString) {
      if (!dateString) return '';
      const date = new Date(dateString);
      return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
    }
  }
}).mount('#app');
