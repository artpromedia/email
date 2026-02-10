# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy workspace files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY tsconfig.base.json tsconfig.json tsconfig.package.json tsconfig.node.json tsconfig.react.json ./
COPY apps/admin/package.json ./apps/admin/
COPY packages/config/package.json ./packages/config/
COPY packages/types/package.json ./packages/types/
COPY packages/ui/package.json ./packages/ui/
COPY packages/utils/package.json ./packages/utils/

# Install dependencies
RUN pnpm install

# Copy source files
COPY packages ./packages
COPY apps/admin ./apps/admin

# Build packages first
RUN pnpm --filter @email/types build || true
RUN pnpm --filter @email/utils build || true
RUN pnpm --filter @email/ui build || true
RUN pnpm --filter @email/config build || true

# Build the admin app
WORKDIR /app/apps/admin
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy built application
COPY --from=builder /app/apps/admin/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/apps/admin/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/admin/.next/static ./apps/admin/.next/static

USER nextjs

EXPOSE 3001

ENV PORT=3001
ENV HOSTNAME="0.0.0.0"

CMD ["node", "apps/admin/server.js"]
