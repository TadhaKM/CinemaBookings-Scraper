const { createApp } = Vue;

const STATUS_META = {
  'now-showing': { label: 'Now showing', cls: 'st-now' },
  'pre-book': { label: 'Pre-book now', cls: 'st-pre' },
  'coming-soon': { label: 'Coming soon', cls: 'st-soon' },
  'not-listed': { label: 'Not on ODEON', cls: 'st-none' },
  unknown: { label: 'Checking…', cls: 'st-soon' }
};

createApp({
  data() {
    return {
      cinemas: [],
      trackedMovies: [],
      notifications: [],
      checking: false,
      tracking: false,
      form: {
        movieName: '',
        anyCinema: true, // "any ODEON Dublin cinema"
        selected: [], // specific cinema ids
        releaseDate: '', // manual override (YYYY-MM-DD)
        leadDays: 10 // start checking this many days before release
      },
      detect: { loading: false, checked: false, found: false, date: null, title: null },
      search: {
        visible: false,
        loading: false,
        data: null
      },
      toast: { visible: false, message: '', type: 'success' }
    };
  },

  async mounted() {
    await this.loadCinemas();
    await this.loadTrackedMovies();
    await this.loadNotifications();

    setInterval(async () => {
      await this.loadTrackedMovies();
      await this.loadNotifications();
    }, 120000);
  },

  methods: {
    // ---- data loading ----
    async loadCinemas() {
      try {
        this.cinemas = await (await fetch('/api/cinemas')).json();
      } catch (e) {
        this.showToast('Failed to load cinemas', 'error');
      }
    },
    async loadTrackedMovies() {
      try {
        this.trackedMovies = await (await fetch('/api/tracked')).json();
      } catch (e) {
        /* ignore */
      }
    },
    async loadNotifications() {
      try {
        this.notifications = await (await fetch('/api/notifications')).json();
      } catch (e) {
        /* ignore */
      }
    },

    // ---- cinema selection ----
    chooseAny() {
      this.form.anyCinema = true;
      this.form.selected = [];
    },
    toggleCinema(id) {
      this.form.anyCinema = false;
      const i = this.form.selected.indexOf(id);
      if (i === -1) this.form.selected.push(id);
      else this.form.selected.splice(i, 1);
      if (this.form.selected.length === 0) this.form.anyCinema = true;
    },
    isSelected(id) {
      return !this.form.anyCinema && this.form.selected.includes(id);
    },
    selectionValid() {
      return this.form.anyCinema || this.form.selected.length > 0;
    },
    requestParams() {
      return this.form.anyCinema
        ? 'all=true'
        : 'cinemas=' + this.form.selected.map(encodeURIComponent).join(',');
    },

    // ---- release-date detection ----
    onNameInput() {
      clearTimeout(this._detectTimer);
      const name = this.form.movieName.trim();
      if (name.length < 2) {
        this.detect = { loading: false, checked: false, found: false, date: null, title: null };
        return;
      }
      this._detectTimer = setTimeout(() => this.lookupRelease(name), 450);
    },
    async lookupRelease(name) {
      this.detect.loading = true;
      try {
        const hit = await (await fetch(`/api/release-schedule/lookup?title=${encodeURIComponent(name)}`)).json();
        if (hit && hit.date) {
          this.detect = { loading: false, checked: true, found: true, date: hit.date, title: hit.title };
        } else {
          this.detect = { loading: false, checked: true, found: false, date: null, title: null };
        }
      } catch (e) {
        this.detect = { loading: false, checked: true, found: false, date: null, title: null };
      }
    },

    // ---- status + scheduling helpers ----
    statusMeta(status) {
      return STATUS_META[status] || STATUS_META.unknown;
    },
    isAnyEntry(movie) {
      return movie.cinemaId === 'all';
    },
    daysUntil(dateStr) {
      if (!dateStr) return null;
      const rel = new Date(`${dateStr}T00:00:00`);
      if (isNaN(rel)) return null;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return Math.ceil((rel - today) / 86400000);
    },
    fmtDate(dateStr) {
      if (!dateStr) return '';
      const d = new Date(`${dateStr}T00:00:00`);
      return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    },
    // Human label for how often a tracked film is being checked.
    cadenceLabel(movie) {
      if (movie.status === 'found') return 'Bookable';
      const lead = Number.isFinite(movie.leadDays) ? movie.leadDays : 10;
      const d = this.daysUntil(movie.releaseDate);
      if (d === null) return 'Checking every 3h';
      if (d > lead) {
        const start = d - lead;
        return `Checks begin in ${start} day${start === 1 ? '' : 's'}`;
      }
      if (d <= 5) return 'Checking every 1h';
      if (d <= 7) return 'Checking every 2h';
      return 'Checking every 3h';
    },
    releaseLabel(movie) {
      if (!movie.releaseDate) return null;
      const d = this.daysUntil(movie.releaseDate);
      const rel = this.fmtDate(movie.releaseDate);
      if (d === null) return `Releases ${rel}`;
      if (d < 0) return `Released ${rel}`;
      if (d === 0) return `Releases today (${rel})`;
      return `Releases ${rel} · ${d} day${d === 1 ? '' : 's'}`;
    },

    // ---- search ----
    async searchNow() {
      if (!this.form.movieName || !this.selectionValid()) {
        this.showToast('Enter a film and pick a cinema', 'error');
        return;
      }
      this.search.visible = true;
      this.search.loading = true;
      this.search.data = null;
      try {
        const url = `/api/search?movie=${encodeURIComponent(this.form.movieName)}&${this.requestParams()}`;
        this.search.data = await (await fetch(url)).json();
      } catch (e) {
        this.showToast('Search failed', 'error');
      } finally {
        this.search.loading = false;
      }
    },

    // ---- track ----
    async trackMovie(nameOverride) {
      const movieName = nameOverride || this.form.movieName;
      if (!movieName || !this.selectionValid()) {
        this.showToast('Enter a film and pick a cinema', 'error');
        return;
      }
      this.tracking = true;
      try {
        const body = this.form.anyCinema
          ? { movieName, all: true }
          : { movieName, cinemaIds: this.form.selected };
        if (this.form.releaseDate) body.releaseDate = this.form.releaseDate;
        if (Number.isFinite(Number(this.form.leadDays))) body.leadDays = Number(this.form.leadDays);
        const res = await fetch('/api/track', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        const data = await res.json();
        if (data.success) {
          const n = (data.added || []).length;
          this.showToast(`Tracking “${movieName}” at ${n} cinema${n > 1 ? 's' : ''}`, 'success');
          this.form.movieName = '';
          this.form.releaseDate = '';
          this.detect = { loading: false, checked: false, found: false, date: null, title: null };
          this.search.visible = false;
          await this.loadTrackedMovies();
          this.refreshSoon(); // background check may update status shortly
        } else {
          this.showToast(data.error || 'Failed to track', 'error');
        }
      } catch (e) {
        this.showToast('Failed to track', 'error');
      } finally {
        this.tracking = false;
      }
    },
    async trackFromSearch() {
      if (this.search.data && this.search.data.film) {
        await this.trackMovie(this.search.data.film.name);
      }
    },

    // Poll a few times after tracking to catch the background availability check
    refreshSoon() {
      [4000, 12000, 25000, 45000].forEach((ms) =>
        setTimeout(async () => {
          await this.loadTrackedMovies();
          await this.loadNotifications();
        }, ms)
      );
    },

    async checkAllMovies() {
      this.checking = true;
      try {
        const data = await (await fetch('/api/check', { method: 'POST' })).json();
        if (data.success) {
          this.showToast('Check completed', 'success');
          await this.loadTrackedMovies();
          await this.loadNotifications();
        }
      } catch (e) {
        this.showToast('Check failed', 'error');
      } finally {
        this.checking = false;
      }
    },

    async removeMovie(id) {
      if (!confirm('Stop tracking this film?')) return;
      try {
        await fetch(`/api/track/${id}`, { method: 'DELETE' });
        this.showToast('Removed from watchlist', 'success');
        await this.loadTrackedMovies();
      } catch (e) {
        this.showToast('Failed to remove', 'error');
      }
    },

    async clearNotifications() {
      try {
        await fetch('/api/notifications', { method: 'DELETE' });
        await this.loadNotifications();
      } catch (e) {
        /* ignore */
      }
    },

    // ---- misc ----
    showToast(message, type = 'success') {
      this.toast = { visible: true, message, type };
      setTimeout(() => (this.toast.visible = false), 3000);
    },
    formatDateTime(s) {
      if (!s) return '';
      const d = new Date(s);
      return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
  }
}).mount('#app');
