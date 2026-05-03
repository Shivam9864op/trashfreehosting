FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY . .

ENV NODE_ENV=production
ENV WORKER_CONCURRENCY=4

CMD ["sh", "-c", "npm run start:worker -- --concurrency=${WORKER_CONCURRENCY}"]
