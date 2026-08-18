FROM node:22-slim
WORKDIR /app
# node:*-slim doesn't ship OpenSSL, so Prisma's engine can't detect the
# libssl version and falls back to a guess at runtime (harmless so far, but
# a real risk on a base-image bump) — Prisma's own warning says to install
# this directly.
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm install
COPY . .
RUN npx prisma generate
RUN npm run build
EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && npx prisma db seed && npm start"]
