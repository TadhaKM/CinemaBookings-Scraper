FROM node:20-alpine

# tzdata is required for TZ to take effect on Alpine. The scheduler compares
# release dates at *local* midnight, so running in UTC would shift the day
# boundary and could fire a check a day early or late.
RUN apk add --no-cache tzdata
ENV TZ=Europe/Dublin
ENV NODE_ENV=production

WORKDIR /app

# Install production deps first so this layer caches across code changes.
COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# data/ holds the watchlist, settings and schedule cache. Mount a persistent
# volume here in production or state is lost on every redeploy.
RUN mkdir -p /app/data && chown -R node:node /app

USER node

EXPOSE 3000
CMD ["node", "server.js"]
