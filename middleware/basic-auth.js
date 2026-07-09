/**
 * HTTP Basic auth.
 *
 * The app has no user accounts, but once it's on a public URL every endpoint is
 * dangerous: GET /api/settings exposes the ntfy topic (which lets anyone read
 * your alerts and push fake ones to your phone), POST /api/notify/test can spam
 * you, and DELETE /api/track/:id wipes the watchlist.
 *
 * Enabled only when APP_USER and APP_PASS are both set, so local development
 * stays frictionless and a misconfigured deploy fails loudly rather than
 * silently serving an open app... see the warning below.
 */

const crypto = require('crypto');

/** Constant-time string compare (length mismatch short-circuits). */
function safeEqual(a, b) {
  const ab = Buffer.from(String(a), 'utf8');
  const bb = Buffer.from(String(b), 'utf8');
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/**
 * @param {object} opts
 * @param {string} [opts.user]    APP_USER
 * @param {string} [opts.pass]    APP_PASS
 * @param {string[]} [opts.exempt] paths that skip auth (e.g. health checks)
 */
function basicAuth({ user, pass, exempt = [] } = {}) {
  if (!user || !pass) {
    if (process.env.NODE_ENV === 'production') {
      console.warn(
        '⚠ Auth DISABLED in production — anyone with the URL can read your ntfy topic ' +
          'and control your watchlist. Set APP_USER and APP_PASS.'
      );
    } else {
      console.log('🔓 Auth: disabled (set APP_USER + APP_PASS to enable)');
    }
    return (req, res, next) => next();
  }

  console.log('🔒 Auth: basic auth enabled');

  return function basicAuthMiddleware(req, res, next) {
    if (exempt.includes(req.path)) return next();

    const header = req.headers.authorization || '';
    const [scheme, encoded] = header.split(' ');

    if (scheme === 'Basic' && encoded) {
      const decoded = Buffer.from(encoded, 'base64').toString('utf8');
      const sep = decoded.indexOf(':'); // password may contain ':'
      if (sep !== -1) {
        const u = decoded.slice(0, sep);
        const p = decoded.slice(sep + 1);
        // Always evaluate both to avoid short-circuiting on the username.
        const okUser = safeEqual(u, user);
        const okPass = safeEqual(p, pass);
        if (okUser && okPass) return next();
      }
    }

    res.set('WWW-Authenticate', 'Basic realm="ODEON Watch", charset="UTF-8"');
    return res.status(401).send('Authentication required');
  };
}

module.exports = basicAuth;
