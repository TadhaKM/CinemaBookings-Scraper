FROM node:20-alpine

# tzdata: required for TZ to take effect on Alpine. The scheduler compares
#   release dates at *local* midnight, so running in UTC would shift the day
#   boundary and could fire a check a day early or late.
# su-exec: lets the entrypoint fix volume ownership as root, then drop to `node`.
RUN apk add --no-cache tzdata su-exec
ENV TZ=Europe/Dublin
ENV NODE_ENV=production

WORKDIR /app

# Install production deps first so this layer caches across code changes.
COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# data/ holds the watchlist, settings and schedule cache. Mount a persistent
# volume here in production or state is lost on every redeploy. The mount lands
# root-owned at run time, so entrypoint.sh chowns it before dropping privileges.
RUN mkdir -p /app/data \
 && chown -R node:node /app \
 && chmod +x /app/entrypoint.sh

EXPOSE 3000

# Starts as root only long enough to chown the volume, then execs as `node`.
ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["node", "server.js"]
