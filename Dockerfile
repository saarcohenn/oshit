# ---- client build ----
FROM node:24-bookworm-slim AS client
WORKDIR /client
COPY client/package.json client/package-lock.json* ./
RUN npm install
COPY client/ ./
RUN npm run build

# ---- server build ----
FROM node:24-bookworm-slim AS server
WORKDIR /server
# better-sqlite3 מתקמפל נייטיב ולכן דורש כלי בנייה בשלב ההתקנה
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY server/package.json server/package-lock.json* ./
# npm חוסם סקריפטי התקנה כברירת מחדל, ולכן better-sqlite3 מסתמך על בינארי מוכן.
# rebuild מפורש מקמפל אותו מהמקור כשאין בינארי לארכיטקטורה — למשל הומלאב ARM.
RUN npm install && npm rebuild better-sqlite3 --build-from-source
COPY server/ ./
RUN npm run build && npm prune --omit=dev

# ---- runtime ----
FROM node:24-bookworm-slim
ENV NODE_ENV=production \
    PORT=8080 \
    DATA_DIR=/app/data \
    PUBLIC_DIR=/app/public
WORKDIR /app
COPY --from=server /server/node_modules ./node_modules
COPY --from=server /server/dist ./dist
COPY --from=client /client/dist ./public
VOLUME /app/data
EXPOSE 8080
CMD ["node", "dist/index.js"]
