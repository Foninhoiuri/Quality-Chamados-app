# Debian slim: o schema engine do Prisma precisa do openssl.
FROM node:20-slim

RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends openssl ca-certificates; \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# O start roda via tsx, que é devDependency — por isso NÃO usar --omit=dev
COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY . .

ENV NODE_ENV=production
EXPOSE 3002

# db push cria/atualiza o schema no boot; o arquivo SQLite fica no volume /data
CMD ["sh", "-c", "npx prisma db push --skip-generate && npm run start"]
