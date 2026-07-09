/**
 * Outbound notifications: email (SMTP), phone push (ntfy.sh), SMS (Twilio).
 *
 * Design rules:
 *  - Secrets live in .env; recipients/toggles live in settings (data/settings.json).
 *  - A channel is only used when it is BOTH *configured* (creds present) and
 *    *enabled* (toggled on, with a recipient).
 *  - Dispatch is fire-and-forget and fully fail-safe: a dead SMTP server or a
 *    Twilio outage must never break the availability check loop.
 */

const nodemailer = require('nodemailer');
const settings = require('./settings');

const NTFY_SERVER = process.env.NTFY_SERVER || 'https://ntfy.sh';
const REQUEST_TIMEOUT = 15000;

// --- capability detection (based on .env) -----------------------------------

function emailConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

// ntfy needs no credentials — only a topic, which lives in settings.
function pushConfigured() {
  return true;
}

function smsConfigured() {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM
  );
}

/**
 * Which channels are available, and which are actually active right now.
 * Safe to send to the browser — contains no secrets.
 */
function status() {
  const n = settings.get().notifications;
  return {
    email: { configured: emailConfigured(), enabled: !!n.email.enabled, hasRecipient: !!n.email.to },
    push: { configured: pushConfigured(), enabled: !!n.push.enabled, hasRecipient: !!n.push.topic },
    sms: { configured: smsConfigured(), enabled: !!n.sms.enabled, hasRecipient: !!n.sms.to }
  };
}

function activeChannels() {
  const s = status();
  return Object.entries(s)
    .filter(([, v]) => v.configured && v.enabled && v.hasRecipient)
    .map(([k]) => k);
}

// --- message building -------------------------------------------------------

/**
 * ntfy headers must be latin-1 safe. Transliterate common typographic
 * punctuation first so we don't leave holes (and double spaces) behind.
 */
function asciiSafe(str) {
  return String(str)
    .replace(/[—–]/g, '-')
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, '...')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatShowings(showings = []) {
  return showings
    .map((s) => {
      const times = (s.showtimes || []).slice(0, 6).map((t) => t.time).join(', ');
      const more = (s.showtimes || []).length > 6 ? ` (+${s.showtimes.length - 6} more)` : '';
      return times ? `${s.cinemaName}: ${times}${more}` : s.cinemaName;
    })
    .join('\n');
}

/**
 * Build the message payload from a stored notification record.
 */
function buildMessage(notification) {
  const { movieName, message, details = {} } = notification;
  const isPreBook = details.status === 'pre-book';
  const title = `${movieName} — ${isPreBook ? 'available to pre-book' : 'now showing'}`;

  const lines = [message];
  const showings = formatShowings(details.showings);
  if (showings) lines.push('', showings);
  if (details.releaseDate) lines.push('', `Release: ${details.releaseDate}`);
  if (details.filmUrl) lines.push('', `Book: ${details.filmUrl}`);

  const text = lines.join('\n');

  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:520px">
      <h2 style="margin:0 0 4px">🎬 ${escapeHtml(movieName)}</h2>
      <p style="margin:0 0 16px;color:#666">${escapeHtml(message)}</p>
      ${
        details.showings && details.showings.length
          ? details.showings
              .map(
                (s) => `<p style="margin:0 0 8px"><strong>${escapeHtml(s.cinemaName)}</strong><br>
              ${(s.showtimes || []).slice(0, 8).map((t) => escapeHtml(t.time)).join(' &nbsp;·&nbsp; ')}</p>`
              )
              .join('')
          : ''
      }
      ${details.releaseDate ? `<p style="color:#666;margin:12px 0 0">Release: ${escapeHtml(details.releaseDate)}</p>` : ''}
      ${
        details.filmUrl
          ? `<p style="margin:20px 0 0"><a href="${escapeAttr(details.filmUrl)}"
             style="background:#f2b43c;color:#211804;padding:10px 18px;border-radius:8px;
             text-decoration:none;font-weight:600">Book tickets</a></p>`
          : ''
      }
    </div>`;

  // SMS is billed per segment — keep it terse.
  const sms = [
    `${movieName} is ${isPreBook ? 'available to pre-book' : 'now showing'}`,
    details.showings?.length ? details.showings.map((s) => s.cinemaName).join(', ') : null,
    details.filmUrl || null
  ]
    .filter(Boolean)
    .join('. ')
    .slice(0, 320);

  return { title, text, html, sms, url: details.filmUrl || null, isPreBook };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
function escapeAttr(s) {
  return escapeHtml(s);
}

// --- channels ---------------------------------------------------------------

let transporter = null;
function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });
  }
  return transporter;
}

async function sendEmail(msg, to) {
  await getTransporter().sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject: `🎬 ${msg.title}`,
    text: msg.text,
    html: msg.html
  });
  return `email → ${to}`;
}

async function sendPush(msg, topic) {
  const headers = {
    Title: asciiSafe(msg.title),
    Tags: 'clapper',
    Priority: msg.isPreBook ? 'default' : 'high'
  };
  if (msg.url) headers.Click = msg.url;

  const res = await fetchWithTimeout(`${NTFY_SERVER}/${encodeURIComponent(topic)}`, {
    method: 'POST',
    headers,
    body: msg.text
  });
  if (!res.ok) throw new Error(`ntfy HTTP ${res.status}: ${(await res.text().catch(() => '')).slice(0, 120)}`);
  return `push → ${NTFY_SERVER}/${topic}`;
}

async function sendSms(msg, to) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const body = new URLSearchParams({ To: to, From: process.env.TWILIO_FROM, Body: msg.sms });

  const res = await fetchWithTimeout(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  });
  if (!res.ok) throw new Error(`Twilio HTTP ${res.status}: ${(await res.text().catch(() => '')).slice(0, 160)}`);
  return `sms → ${to}`;
}

async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// --- dispatch ---------------------------------------------------------------

/**
 * Send a notification across every active channel.
 * Never throws — returns a per-channel result summary.
 */
async function send(notification) {
  const n = settings.get().notifications;
  const msg = buildMessage(notification);
  const channels = activeChannels();

  if (!channels.length) return { sent: [], failed: [], skipped: 'no active channels' };

  const jobs = channels.map((ch) => {
    if (ch === 'email') return { ch, run: () => sendEmail(msg, n.email.to) };
    if (ch === 'push') return { ch, run: () => sendPush(msg, n.push.topic) };
    return { ch, run: () => sendSms(msg, n.sms.to) };
  });

  const results = await Promise.allSettled(jobs.map((j) => j.run()));

  const sent = [];
  const failed = [];
  results.forEach((r, i) => {
    const ch = jobs[i].ch;
    if (r.status === 'fulfilled') {
      sent.push(ch);
      console.log(`📨 Notification ${r.value}`);
    } else {
      failed.push({ channel: ch, error: r.reason?.message || String(r.reason) });
      console.error(`⚠ Notification via ${ch} failed:`, r.reason?.message || r.reason);
    }
  });

  return { sent, failed };
}

/** Fire a test notification through every active channel. */
async function sendTest() {
  return send({
    movieName: 'Test Film',
    message: 'This is a test alert from ODEON Watch. Notifications are working.',
    details: {
      status: 'now-showing',
      showings: [{ cinemaName: 'ODEON Point Square', showtimes: [{ time: '18:30' }, { time: '21:00' }] }],
      filmUrl: 'https://www.odeoncinemas.ie/films/'
    }
  });
}

module.exports = { send, sendTest, status, activeChannels, buildMessage };
