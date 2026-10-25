# שירות הסוכנים — קונטיינר נפרד מהאפליקציה, בלי פורט.
# המפתח של Anthropic נמצא רק כאן; האפליקציה הראשית לא מחזיקה אותו.

FROM node:24-bookworm-slim AS build
WORKDIR /agents
COPY package.json package-lock.json* ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:24-bookworm-slim
ENV NODE_ENV=production \
    DATA_DIR=/data \
    PORTFOLIO_FILE=/config/portfolio.json
WORKDIR /app
COPY --from=build /agents/node_modules ./node_modules
COPY --from=build /agents/dist ./dist
COPY package.json ./
# משתמש node מובנה בתמונה — אין סיבה שסוכן ירוץ כ-root
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
# הדופק נכתב כל 30 שניות. שתי דקות בלי דופק — הלולאה תקועה
HEALTHCHECK --interval=60s --timeout=5s --start-period=30s --retries=2 \
  CMD node -e "process.exit(Date.now() - require('fs').statSync('/data/heartbeat').mtimeMs < 120000 ? 0 : 1)"
CMD ["node", "dist/main.js"]
