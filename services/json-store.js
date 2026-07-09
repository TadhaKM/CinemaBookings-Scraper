/**
 * Small JSON file store with two safety properties:
 *
 *  - **Atomic writes.** We write to a temp file and rename it into place, so a
 *    crash (or a killed process) mid-write can't leave a truncated file.
 *  - **No silent data loss.** If an existing file fails to parse we move it
 *    aside as `<name>.corrupt-<ts>` and shout about it, rather than quietly
 *    returning an empty value that the next write would then persist over.
 */

const fs = require('fs');

function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  try {
    const raw = fs.readFileSync(file, 'utf8');
    if (!raw.trim()) return fallback;
    return JSON.parse(raw);
  } catch (error) {
    const backup = `${file}.corrupt-${Date.now()}`;
    try {
      fs.renameSync(file, backup);
      console.error(`⚠ ${file} was unreadable (${error.message}). Moved to ${backup}.`);
    } catch (renameErr) {
      console.error(`⚠ ${file} was unreadable and could not be backed up:`, renameErr.message);
    }
    return fallback;
  }
}

function writeJson(file, data) {
  const tmp = `${file}.tmp`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, file); // atomic on the same filesystem
  } catch (error) {
    console.error(`Error writing ${file}:`, error.message);
    try {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    } catch (_) {
      /* ignore */
    }
  }
}

module.exports = { readJson, writeJson };
