FROM node:24-bookworm-slim

WORKDIR /app

# This app uses only Node's built-in modules; there is no install/build step.
COPY package.json server.js rules.js odds.js ./
COPY public ./public

RUN mkdir -p /var/data

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=10000 \
    DATABASE_PATH=/var/data/pool.sqlite \
    COOKIE_SECURE=true

EXPOSE 10000

CMD ["node", "server.js"]
