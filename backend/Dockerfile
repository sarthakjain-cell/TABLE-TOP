FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./

RUN npm ci

COPY prisma ./prisma/
RUN npx prisma generate

COPY . .

RUN npm run build

# Prune dev dependencies
RUN npm prune --omit=dev

ENV PORT=5000

EXPOSE 5000

CMD ["node", "dist/server.js"]
