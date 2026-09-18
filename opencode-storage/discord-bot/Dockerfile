# KS Bot + Manager
FROM node:20-bullseye

RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy bot
COPY bot/package*.json ./bot/
RUN cd bot && npm install --omit=dev

COPY bot ./bot

# Copy manager backend
COPY manage/package*.json ./manage/
RUN cd manage && npm install --omit=dev

COPY manage ./manage

# Build frontend (needs dev deps)
RUN cd manage/frontend && npm install && npm run build

# Ensure data dir
RUN mkdir -p bot/data

ENV MANAGE_PORT=10000
ENV NODE_ENV=production
EXPOSE 10000

# Health
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD node -e "fetch('http://localhost:10000/api/status').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))" || exit 1

CMD ["node", "manage/index.js"]
