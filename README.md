# OONRUMAIL

A production-ready multi-domain email platform built using a modern TypeScript monorepo
architecture.

## Features

- 🌐 **Multi-Domain Support**: Manage multiple email domains from a single platform
- 🔐 **Enterprise Security**: DKIM, SPF, DMARC, and TLS encryption
- 📊 **Real-time Analytics**: Track email delivery, opens, and clicks
- 🏗️ **Scalable Architecture**: Built for high-volume email processing
- 🎨 **Modern UI**: Beautiful admin dashboard with dark mode support

## Tech Stack

- **Monorepo**: Turborepo + pnpm workspaces
- **Frontend**: Next.js 14, React 19, Tailwind CSS
- **UI Components**: Radix UI, shadcn/ui patterns
- **Type Safety**: TypeScript with strict mode
- **Validation**: Zod for runtime validation
- **Linting**: ESLint 9 + Prettier
- **Git Hooks**: Husky + lint-staged

## Project Structure

```
oonrumail/
├── apps/
│   ├── web/           # Main web application (Next.js)
│   └── admin/         # Admin dashboard (Next.js)
├── packages/
│   ├── config/        # Shared configuration & env validation
│   ├── types/         # Shared TypeScript types
│   ├── utils/         # Shared utility functions
│   └── ui/            # Shared UI components
├── docker/            # Docker configuration
│   ├── config/        # Service configurations
│   └── init-scripts/  # Database initialization
├── turbo.json         # Turborepo configuration
├── docker-compose.yml # Local development services
└── package.json       # Root package.json
```

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm 9+
- Docker & Docker Compose

### Installation

```bash
# Clone the repository
git clone https://github.com/artpromedia/email.git
cd email

# Install dependencies
pnpm install

# Copy environment variables
cp .env.example .env

# Start Docker services
pnpm docker:up

# Start development servers
pnpm dev
```

### Available Scripts

```bash
# Development
pnpm dev          # Start all apps in development mode
pnpm build        # Build all packages and apps
pnpm lint         # Lint all packages
pnpm lint:fix     # Fix linting issues
pnpm type-check   # Run TypeScript type checking
pnpm format       # Format code with Prettier

# Docker
pnpm docker:up    # Start all Docker services
pnpm docker:down  # Stop all Docker services
pnpm docker:logs  # View Docker logs
pnpm docker:reset # Reset all Docker volumes

# Testing
pnpm test         # Run all tests
pnpm test:coverage # Run tests with coverage
```

## Multi-Domain Architecture

The system supports multiple email domains out of the box:

### Domain Configuration

Each domain has its own:

- DKIM keys for email signing
- SPF records for sender verification
- DMARC policies for email authentication
- Rate limits and quotas
- User management

### Environment Variables

```bash
# Multi-Domain Configuration
PRIMARY_DOMAIN=example.com
ALLOWED_DOMAINS=example.com,example.org,subsidiary.com
DEFAULT_DOMAIN=example.com

# Per-Domain DKIM
DKIM_SELECTOR=mail
DKIM_KEYS_PATH=/etc/dkim/keys
```

### DNS Configuration

For each domain, configure the following DNS records:

```dns
; MX Record
@       IN  MX  10  mail.example.com.

; SPF Record
@       IN  TXT "v=spf1 mx a -all"

; DKIM Record
mail._domainkey IN  TXT "v=DKIM1; k=rsa; p=YOUR_PUBLIC_KEY"

; DMARC Record
_dmarc  IN  TXT "v=DMARC1; p=quarantine; rua=mailto:dmarc@example.com"
```

## Development Services

| Service               | Port | URL                   |
| --------------------- | ---- | --------------------- |
| Web App               | 3000 | http://localhost:3000 |
| Admin App             | 3001 | http://localhost:3001 |
| PostgreSQL            | 5432 | -                     |
| Redis                 | 6379 | -                     |
| MinIO Console         | 9001 | http://localhost:9001 |
| OpenSearch            | 9200 | http://localhost:9200 |
| OpenSearch Dashboards | 5601 | http://localhost:5601 |
| Mailpit (SMTP)        | 1025 | -                     |
| Mailpit (Web)         | 8025 | http://localhost:8025 |
| Adminer (DB UI)       | 8080 | http://localhost:8080 |
| Redis Commander       | 8081 | http://localhost:8081 |

## Packages

### @email/config

Shared configuration and environment validation using Zod.

```typescript
import { getEnv, validateEnv } from "@email/config";

const env = getEnv();
console.log(env.PRIMARY_DOMAIN); // Type-safe environment access
```

### @email/types

Shared TypeScript types for the entire system.

```typescript
import type { Email, User, DomainConfig } from "@email/types";
```

### @email/utils

Shared utility functions.

```typescript
import { generateId, formatBytes, retry } from "@email/utils";
```

### @email/ui

Shared UI components built with Radix UI and Tailwind CSS.

```typescript
import { Button, Card, Badge } from "@email/ui";
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Commit Convention

This project uses [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` New features
- `fix:` Bug fixes
- `docs:` Documentation changes
- `style:` Code style changes
- `refactor:` Code refactoring
- `perf:` Performance improvements
- `test:` Test changes
- `build:` Build system changes
- `ci:` CI/CD changes
- `chore:` Other changes

## License

MIT © OONRUMAIL Team
