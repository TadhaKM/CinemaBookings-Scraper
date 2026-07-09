/**
 * User-configurable check-schedule settings, persisted to data/settings.json.
 *
 * The cadence is expressed as a list of tiers:
 *   [{ withinDays: 10, everyHours: 3 }, { withinDays: 7, everyHours: 2 }, ...]
 *
 * For a film that is `d` days from release we pick the FIRST tier (ascending by
 * withinDays) where `d <= withinDays`. So the defaults below mean:
 *   d <= 5  -> every 1h      (also covers films already released)
 *   d <= 7  -> every 2h      (i.e. 7 and 6 days out)
 *   d <= 10 -> every 3h      (i.e. 10, 9 and 8 days out)
 *   d > 10  -> slowest tier, until d > leadDays where we don't check at all
 */

const fs = require('fs');
const path = require('path');
const store = require('./json-store');

const DATA_DIR = path.join(__dirname, '../data');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

// The scheduler ticks every 10 minutes, so intervals below that are pointless.
const MIN_INTERVAL_MINUTES = 10;
const MIN_HOURS = 0.25; // 15 minutes
const MAX_HOURS = 24 * 7;

const DEFAULTS = {
  leadDays: 10,
  unknownIntervalHours: 3,
  tiers: [
    { withinDays: 5, everyHours: 1 },
    { withinDays: 7, everyHours: 2 },
    { withinDays: 10, everyHours: 3 }
  ],
  // Recipients + toggles only. Credentials live in .env, never here.
  notifications: {
    email: { enabled: false, to: '' },
    push: { enabled: false, topic: '' }, // ntfy.sh topic
    sms: { enabled: false, to: '' }
  }
};

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

let cache = null;

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

/**
 * Coerce arbitrary input into a valid settings object (falling back to defaults).
 */
function sanitize(input = {}) {
  const leadDays = Number.isFinite(Number(input.leadDays))
    ? clamp(Math.round(Number(input.leadDays)), 0, 365)
    : DEFAULTS.leadDays;

  const unknownIntervalHours = Number.isFinite(Number(input.unknownIntervalHours))
    ? clamp(Number(input.unknownIntervalHours), MIN_HOURS, MAX_HOURS)
    : DEFAULTS.unknownIntervalHours;

  let tiers = Array.isArray(input.tiers) ? input.tiers : DEFAULTS.tiers;
  tiers = tiers
    .map((t) => ({
      withinDays: Number(t?.withinDays),
      everyHours: Number(t?.everyHours)
    }))
    .filter((t) => Number.isFinite(t.withinDays) && Number.isFinite(t.everyHours))
    .map((t) => ({
      withinDays: clamp(Math.round(t.withinDays), 0, 365),
      everyHours: clamp(t.everyHours, MIN_HOURS, MAX_HOURS)
    }));

  // Dedupe by withinDays (last wins) and sort ascending.
  const byDay = new Map();
  for (const t of tiers) byDay.set(t.withinDays, t);
  tiers = [...byDay.values()].sort((a, b) => a.withinDays - b.withinDays);

  // An empty tier list is legal: it means "no ramping" — everything inside the
  // lead window is checked at `unknownIntervalHours`. We must NOT silently
  // restore the defaults here, or deleting every interval appears to do nothing.

  return { leadDays, unknownIntervalHours, tiers, notifications: sanitizeNotifications(input.notifications) };
}

function str(v, max = 200) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function sanitizeNotifications(input = {}) {
  const d = DEFAULTS.notifications;
  const email = { ...d.email, ...(input.email || {}) };
  const push = { ...d.push, ...(input.push || {}) };
  const sms = { ...d.sms, ...(input.sms || {}) };

  const to = str(email.to);
  const topic = str(push.topic, 80).replace(/[^\w-]/g, ''); // ntfy topics are [\w-]
  const phone = str(sms.to, 32).replace(/[^\d+]/g, '');

  return {
    // A channel can't be "enabled" without a valid-looking recipient.
    email: { enabled: Boolean(email.enabled) && /.+@.+\..+/.test(to), to },
    push: { enabled: Boolean(push.enabled) && topic.length > 0, topic },
    sms: { enabled: Boolean(sms.enabled) && /^\+\d{7,15}$/.test(phone), to: phone }
  };
}

function load() {
  const raw = store.readJson(SETTINGS_FILE, null);
  if (!raw) return { ...DEFAULTS, tiers: [...DEFAULTS.tiers] };
  return sanitize(raw);
}

/** Current settings (cached, sync). */
function get() {
  if (!cache) cache = load();
  return cache;
}

/** Validate, persist and return the new settings. */
function save(input) {
  const next = sanitize(input);
  store.writeJson(SETTINGS_FILE, next);
  cache = next;
  return next;
}

/**
 * Minutes between checks for a film `d` days from release.
 * Returns null when the film is outside its lead window (don't check yet).
 *
 * With no tiers configured, every in-window film is checked at the default
 * interval (`unknownIntervalHours`) — a flat cadence with no ramping.
 *
 * @param {number|null} d          days until release (null = unknown)
 * @param {object} overrides       { leadDays?, tiers? } per-film overrides
 */
function intervalMinutesFor(d, overrides = {}) {
  const s = get();
  const leadDays = Number.isFinite(overrides.leadDays) ? overrides.leadDays : s.leadDays;
  const tiers =
    Array.isArray(overrides.tiers) && overrides.tiers.length ? sanitize({ tiers: overrides.tiers }).tiers : s.tiers;

  const fallback = Math.max(MIN_INTERVAL_MINUTES, Math.round(s.unknownIntervalHours * 60));

  if (d === null || d === undefined) return fallback; // unknown release date
  if (d > leadDays) return null; // window not open yet
  if (!tiers.length) return fallback; // no ramping configured

  const tier = tiers.find((t) => d <= t.withinDays) || tiers[tiers.length - 1];
  return Math.max(MIN_INTERVAL_MINUTES, Math.round(tier.everyHours * 60));
}

function effectiveLeadDays(overrides = {}) {
  return Number.isFinite(overrides.leadDays) ? overrides.leadDays : get().leadDays;
}

module.exports = {
  DEFAULTS,
  MIN_INTERVAL_MINUTES,
  get,
  save,
  sanitize,
  intervalMinutesFor,
  effectiveLeadDays
};
