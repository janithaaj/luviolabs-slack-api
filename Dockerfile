FROM node:22-alpine AS dependencies
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile \
  && pnpm store prune \
  && rm -rf /root/.cache /tmp/*

FROM dependencies AS build
COPY . .
RUN pnpm build \
  && rm -rf /root/.cache /tmp/*

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_OPTIONS="--max-old-space-size=4096"
ENV NODE_ENV=production
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
USER node
EXPOSE 4002
CMD ["node", "dist/main.js"]
