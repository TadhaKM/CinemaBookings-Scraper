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
      settings: {
        leadDays: 10,
        unknownIntervalHours: 3,
        tiers: [],
        tickMinutes: 10,
        notifications: {
          email: { enabled: false, to: '' },
          push: { enabled: false, topic: '' },
          sms: { enabled: false, to: '' }
        }
      },
      channels: {
        email: { configured: false },
        push: { configured: true },
        sms: { configured: false }
      },
      settingsOpen: false,
      settingsSaving: false,
      testing: false,
      testResult: null,
      search: {
        visible: false,
        loading: false,
        data: null
      },
      toast: { visible: false, message: '', type: 'success' }
    };
  },

  async mounted() {
    await this.loadSettings();
    await this.loadCinemas();
    await this.loadTrackedMovies();
    await this.loadNotifications();

    setInterval(async () => {
      await this.loadTrackedMovies();
      await this.loadNotifications();
    }, 120000);
  },

  methods: {
    /**
     * fetch + JSON with a hard timeout. Without this, a request that never
     * settles leaves `loading`/`tracking`/`checking` stuck true and the UI's
     * buttons disabled forever.
     */
    async fetchJson(url, options = {}, timeoutMs = 90000) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(url, { ...options, signal: controller.signal });
        return await res.json();
      } catch (err) {
        if (err.name === 'AbortError') throw new Error('Timed out — the scrape took too long.');
        throw err;
      } finally {
        clearTimeout(timer);
      }
    },

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

    // ---- check-schedule settings ----
    async loadSettings() {
      try {
        const s = await (await fetch('/api/settings')).json();
        if (s.channels) this.channels = s.channels;
        this.settings = { ...this.settings, ...s };
        this.form.leadDays = s.leadDays;
      } catch (e) {
        /* keep defaults */
      }
    },

    anyChannelActive() {
      const n = this.settings.notifications || {};
      return Boolean(
        (this.channels.email.configured && n.email?.enabled && n.email?.to) ||
          (n.push?.enabled && n.push?.topic) ||
          (this.channels.sms.configured && n.sms?.enabled && n.sms?.to)
      );
    },

    async sendTest() {
      if (this.testing) return;
      this.testing = true;
      this.testResult = null;
      try {
        const r = await this.fetchJson('/api/notify/test', { method: 'POST' }, 30000);
        const sent = r.sent || [];
        const failed = r.failed || [];
        if (sent.length && !failed.length) {
          this.testResult = { ok: true, message: `Test sent via ${sent.join(', ')} — check your device.` };
        } else if (sent.length) {
          this.testResult = {
            ok: false,
            message: `Sent via ${sent.join(', ')}. Failed: ${failed.map((f) => `${f.channel} (${f.error})`).join('; ')}`
          };
        } else if (failed.length) {
          this.testResult = {
            ok: false,
            message: `All channels failed: ${failed.map((f) => `${f.channel} (${f.error})`).join('; ')}`
          };
        } else {
          this.testResult = { ok: false, message: 'No active channels — enable one and save first.' };
        }
      } catch (e) {
        this.testResult = { ok: false, message: 'Test request failed.' };
      } finally {
        this.testing = false;
      }
    },
    async saveSettings() {
      this.settingsSaving = true;
      try {
        const res = await fetch('/api/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            leadDays: Number(this.settings.leadDays),
            unknownIntervalHours: Number(this.settings.unknownIntervalHours),
            tiers: this.settings.tiers.map((t) => ({
              withinDays: Number(t.withinDays),
              everyHours: Number(t.everyHours)
            })),
            notifications: this.settings.notifications
          })
        });
        const data = await res.json();
        if (data.success) {
          this.settings = { ...this.settings, ...data.settings };
          if (data.channels) this.channels = data.channels;
          this.showToast('Settings saved', 'success');
          await this.loadTrackedMovies(); // nextCheckAt recomputed server-side
        } else {
          this.showToast(data.error || 'Failed to save', 'error');
        }
      } catch (e) {
        this.showToast('Failed to save settings', 'error');
      } finally {
        this.settingsSaving = false;
      }
    },
    addTier() {
      const maxDay = this.settings.tiers.reduce((m, t) => Math.max(m, Number(t.withinDays) || 0), 0);
      this.settings.tiers.push({ withinDays: maxDay + 5, everyHours: 6 });
    },
    removeTier(i) {
      this.settings.tiers.splice(i, 1);
    },
    async resetSettings() {
      this.settings = { ...this.settings, ...JSON.parse(JSON.stringify(this.settings.defaults)) };
      await this.saveSettings();
    },

    // Format an interval given in hours: 0.5 -> "30min", 3 -> "3h"
    fmtHours(h) {
      const n = Number(h);
      if (!Number.isFinite(n)) return '—';
      if (n < 1) return `${Math.round(n * 60)}min`;
      return `${Number.isInteger(n) ? n : n.toFixed(1)}h`;
    },

    // Sorted tiers (ascending by withinDays) — the order rules are evaluated in.
    sortedTiers() {
      return [...this.settings.tiers]
        .map((t) => ({ withinDays: Number(t.withinDays), everyHours: Number(t.everyHours) }))
        .filter((t) => Number.isFinite(t.withinDays) && Number.isFinite(t.everyHours))
        .sort((a, b) => a.withinDays - b.withinDays);
    },

    // Plain-English summary of the resulting schedule.
    scheduleSummary() {
      const tiers = this.sortedTiers();
      const lead = Number(this.settings.leadDays);
      const rows = [];

      rows.push({ range: `More than ${lead} days before release`, every: 'not checked yet', dim: true });

      // No tiers = flat cadence, no ramping.
      if (!tiers.length) {
        rows.push({
          range: `${lead} days or fewer (incl. after release)`,
          every: `every ${this.fmtHours(this.settings.unknownIntervalHours)}`
        });
        rows.push({
          range: 'No known release date',
          every: `every ${this.fmtHours(this.settings.unknownIntervalHours)}`,
          dim: true
        });
        return rows;
      }

      const maxWithin = tiers[tiers.length - 1].withinDays;
      if (lead > maxWithin) {
        rows.push({
          range: `${lead}–${maxWithin + 1} days before`,
          every: `every ${this.fmtHours(tiers[tiers.length - 1].everyHours)}`
        });
      }

      for (let i = tiers.length - 1; i >= 0; i--) {
        const upper = tiers[i].withinDays;
        const lower = i === 0 ? null : tiers[i - 1].withinDays + 1;

        // A tier whose whole range sits beyond the lead window can never fire.
        if (lower !== null && lower > lead) {
          rows.push({
            range: `${upper}–${lower} days before`,
            every: `never — outside your ${lead}-day lead window`,
            dim: true
          });
          continue;
        }

        // Clamp the top of the range to the lead window so it reads truthfully.
        const effUpper = Math.min(upper, lead);
        const range =
          lower === null
            ? `${effUpper} days or fewer (incl. after release)`
            : effUpper === lower
              ? `${effUpper} days before`
              : `${effUpper}–${lower} days before`;
        rows.push({ range, every: `every ${this.fmtHours(tiers[i].everyHours)}` });
      }

      rows.push({
        range: 'No known release date',
        every: `every ${this.fmtHours(this.settings.unknownIntervalHours)}`,
        dim: true
      });
      return rows;
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
        const hit = await this.fetchJson(`/api/release-schedule/lookup?title=${encodeURIComponent(name)}`, {}, 10000);
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
    // Mirrors the server's tier resolution in services/settings.js.
    cadenceLabel(movie) {
      if (movie.status === 'found') return 'Bookable';
      const lead = Number.isFinite(movie.leadDays) ? movie.leadDays : Number(this.settings.leadDays);
      const d = this.daysUntil(movie.releaseDate);
      if (d === null) return `Checking every ${this.fmtHours(this.settings.unknownIntervalHours)}`;
      if (d > lead) {
        const start = d - lead;
        return `Checks begin in ${start} day${start === 1 ? '' : 's'}`;
      }
      const tiers = this.sortedTiers();
      if (!tiers.length) return `Checking every ${this.fmtHours(this.settings.unknownIntervalHours)}`;
      const tier = tiers.find((t) => d <= t.withinDays) || tiers[tiers.length - 1];
      return `Checking every ${this.fmtHours(tier.everyHours)}`;
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
      // A search for a bookable film scrapes every cinema and can take a while.
      // Re-entry would stack multi-minute requests and exhaust the browser's
      // per-origin connection pool, freezing the whole page.
      if (this.search.loading) return;
      if (!this.form.movieName || !this.selectionValid()) {
        this.showToast('Enter a film and pick a cinema', 'error');
        return;
      }
      this.search.visible = true;
      this.search.loading = true;
      this.search.data = null;
      try {
        const url = `/api/search?movie=${encodeURIComponent(this.form.movieName)}&${this.requestParams()}`;
        this.search.data = await this.fetchJson(url);
      } catch (e) {
        this.search.visible = false;
        this.showToast(e.message || 'Search failed', 'error');
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
        const data = await this.fetchJson(
          '/api/track',
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
          30000
        );
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

    // The server now runs the check in the background and returns 202 straight
    // away, so we never hold a connection open for minutes.
    async checkAllMovies() {
      if (this.checking) return;
      this.checking = true;
      try {
        const data = await this.fetchJson('/api/check', { method: 'POST' }, 15000);
        if (data.success) {
          this.showToast('Check started — results will appear shortly', 'success');
          this.refreshSoon();
        } else {
          this.showToast(data.error || 'Check failed', 'error');
        }
      } catch (e) {
        this.showToast(e.message || 'Check failed', 'error');
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
