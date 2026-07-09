#!/bin/sh
set -e

# A persistent volume mounted at /app/data comes up owned by root, replacing the
# directory (and its ownership) that we created at build time. Fix it here, at
# run time, before dropping privileges — otherwise the non-root `node` user gets
# EACCES the first time it writes settings.json.
if [ -d /app/data ]; then
  chown -R node:node /app/data 2>/dev/null || \
    echo "⚠ Could not chown /app/data — continuing (already writable?)"
fi

# Drop root and run the app as `node`.
exec su-exec node "$@"
