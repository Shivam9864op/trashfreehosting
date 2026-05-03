FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY . .

ENV NODE_ENV=production
ENV API_PORT=8080

EXPOSE 8080

CMD ["sh", "-c", "npm run migrate && npm run start:api"]
