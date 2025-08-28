# CEERION Mail

A modern, backend-first email platform built with TypeScript and a microservices architecture.

## Architecture

This is a monorepo managed with **Turborepo** and **pnpm workspaces**, containing:

### Apps
- **`apps/api`** - Fastify-based API server with OpenAPI documentation
- **`apps/webmail`** - React-based web client (planned)
- **`apps/admin`** - Administrative dashboard (planned)  
- **`apps/calendar`** - Calendar integration (planned)
- **`apps/chat`** - Real-time messaging (planned)

### Packages
- **`packages/contracts`** - OpenAPI 3.1 specifications
- **`packages/sdk`** - Generated TypeScript client
- **`packages/config`** - Shared ESLint, Prettier, and TypeScript configs
- **`packages/shared`** - Common types and utilities

## Quick Start

### Prerequisites
- Node.js 20+
- pnpm 9+
- Docker and Docker Compose

### Development Setup

1. **Clone and install dependencies**
   ```bash
   git clone <repository-url>
   cd ceerion-mail
   pnpm install
   ```

2. **Start infrastructure services**
   ```bash
   pnpm dev:infra
   ```
   This starts PostgreSQL 16 and Redis in Docker containers.

3. **Configure environment**
   ```bash
   cp env/.env.example apps/api/.env
   ```
   Edit `apps/api/.env` as needed.

4. **Start the API server**
   ```bash
   pnpm -C apps/api dev
   ```
   
   The API will be available at:
   - **API**: http://localhost:4000
   - **Health Check**: http://localhost:4000/healthz
   - **API Docs**: http://localhost:4000/docs
   - **OpenAPI Spec**: http://localhost:4000/openapi.json

### Available Scripts

```bash
# Development
pnpm dev                # Start all development servers
pnpm dev:infra         # Start Docker infrastructure
pnpm stop:infra        # Stop Docker infrastructure

# Building
pnpm build             # Build all packages and apps
pnpm typecheck         # Type check all projects

# Code Quality
pnpm lint              # Lint all projects
pnpm format            # Format all files
pnpm test              # Run all tests

# SDK Generation
pnpm openapi:codegen   # Generate TypeScript SDK from OpenAPI spec
```

## Technology Stack

- **Runtime**: Node.js 20
- **Language**: TypeScript
- **Package Manager**: pnpm
- **Monorepo**: Turborepo
- **API Framework**: Fastify
- **API Documentation**: OpenAPI 3.1 + Swagger UI
- **Database**: PostgreSQL 16
- **Cache**: Redis 7
- **Frontend** (planned): React 19 + Vite + Tailwind CSS

## Environment Variables

Copy `env/.env.example` to your app directories and configure:

```env
BRAND_NAME=CEERION
BASE_DOMAIN=mail.ceerion.com
DATABASE_URL=postgres://postgres:postgres@localhost:5432/ceerion_mail
REDIS_URL=redis://localhost:6379
JWT_PRIVATE_KEY=dev-only-rs256-key
OIDC_GOOGLE_CLIENT_ID=__placeholder__
OIDC_GOOGLE_CLIENT_SECRET=__placeholder__
```

## Project Status

### ✅ Completed
- [x] Monorepo setup with Turborepo + pnpm
- [x] TypeScript configuration
- [x] ESLint and Prettier setup
- [x] Docker Compose development infrastructure
- [x] Fastify API server with health endpoints
- [x] OpenAPI 3.1 specification
- [x] TypeScript SDK generation
- [x] GitHub Actions CI pipeline

### 🚧 In Progress
- [ ] Database schema and migrations
- [ ] Authentication and authorization
- [ ] Email processing engine
- [ ] React webmail client

### 📋 Planned
- [ ] IMAP/SMTP server integration
- [ ] Real-time notifications
- [ ] Calendar application
- [ ] Chat application
- [ ] Administrative dashboard

## Contributing

1. Install dependencies: `pnpm install`
2. Start infrastructure: `pnpm dev:infra`
3. Run tests: `pnpm test`
4. Make your changes
5. Ensure CI passes: `pnpm typecheck && pnpm lint && pnpm build`

## License

MIT
