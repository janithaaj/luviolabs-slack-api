FROM node:22-alpine AS build
WORKDIR /app
ENV CI=true \
    COREPACK_ENABLE=0 \
    npm_config_fund=false \
    npm_config_audit=false
RUN npm install -g pnpm@11.21.0 \
  && npm cache clean --force \
  && rm -rf /root/.npm /tmp/*
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml nest-cli.json tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN pnpm install --frozen-lockfile \
  && pnpm build \
  && pnpm prune --prod \
  && pnpm store prune \
  && rm -rf /root/.local /root/.npm /tmp/*

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./
USER node
EXPOSE 4000
CMD ["node", "dist/main.js"]
