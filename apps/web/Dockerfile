# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy workspace files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY tsconfig.base.json tsconfig.json tsconfig.package.json tsconfig.node.json tsconfig.react.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/config/package.json ./packages/config/
COPY packages/types/package.json ./packages/types/
COPY packages/ui/package.json ./packages/ui/
COPY packages/utils/package.json ./packages/utils/

# Install dependencies
RUN pnpm install

# Copy source files
COPY packages ./packages
COPY apps/web ./apps/web

# Build packages first
RUN pnpm --filter @email/types build || true
RUN pnpm --filter @email/utils build || true
RUN pnpm --filter @email/ui build || true
RUN pnpm --filter @email/config build || true

# Build the web app
WORKDIR /app/apps/web
ENV NEXT_TELEMETRY_DISABLED=1
# Remove babel config to avoid SWC conflict (babel is only needed for Jest tests)
RUN rm -f babel.config.js .babelrc
RUN pnpm build

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy built application
COPY --from=builder /app/apps/web/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "apps/web/server.js"]
