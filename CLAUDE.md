# Docmost - Developer Guide

## Project Structure

```
docmost/
├── apps/
│   ├── client/          # React + Vite frontend
│   │   ├── src/
│   │   │   ├── features/      # Feature-based modules
│   │   │   │   ├── editor/    # TipTap editor implementation
│   │   │   │   ├── page/      # Page management
│   │   │   │   ├── space/     # Space management
│   │   │   │   └── ...
│   │   │   ├── components/    # Shared UI components
│   │   │   └── lib/           # Utilities and helpers
│   │   └── package.json
│   │
│   └── server/          # NestJS backend
│       ├── src/
│       │   ├── core/          # Core modules (auth, casl, config)
│       │   ├── database/      # Database layer
│       │   │   ├── migrations/    # Kysely migrations
│       │   │   ├── repos/         # Data repositories
│       │   │   └── types/         # Database types
│       │   ├── integrations/  # External services (email, storage, etc.)
│       │   └── collaboration/ # Yjs/Hocuspocus collab server
│       └── package.json
│
├── packages/
│   └── editor-ext/      # Shared TipTap editor extensions
│       └── src/
│
├── package.json         # Root monorepo config
├── nx.json             # Nx build system config
└── pnpm-workspace.yaml # pnpm workspaces
```

## Technology Stack

### Frontend
- **Framework**: React 18 + TypeScript
- **Build Tool**: Vite
- **UI Library**: Mantine UI v8
- **Editor**: TipTap 2.27 (ProseMirror-based)
- **Real-time**: Yjs + Hocuspocus Provider
- **State**: React Context + hooks

### Backend
- **Framework**: NestJS
- **Database**: PostgreSQL 16 + Kysely (query builder, no ORM)
- **Cache/Queue**: Redis + BullMQ
- **Auth**: Passport JWT, SAML, OAuth
- **Permissions**: CASL (ability-based)
- **Real-time**: Socket.io + Hocuspocus Server

### Build System
- **Monorepo**: pnpm workspaces
- **Build**: Nx 20.4
- **Package Manager**: pnpm 10.4

## Docker Quick Reference

### Development (Running from Source)

```bash
# Start only databases (PostgreSQL + Redis)
docker compose up -d db redis

# Stop and remove everything including volumes
docker compose down -v
```

**Ports exposed:**
- PostgreSQL: `5432`
- Redis: `6379`

**Environment variables** (from `docker-compose.yml`):
- `POSTGRES_DB=docmost`
- `POSTGRES_USER=docmost`
- `POSTGRES_PASSWORD=<generated>`

### Production (Pre-built Image)

```bash
# Start all services including Docmost app
docker compose up -d
```

**Ports:**
- Docmost app: `3000`

## Development Workflow

### Initial Setup

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm run build

# Run migrations
pnpm --filter server run migration:latest

# Start backend (dev mode with watch)
pnpm run server:dev

# Start frontend (dev mode with HMR)
pnpm run client:dev

# Or start both concurrently
pnpm run dev
```

### Available Scripts

```bash
# Build
pnpm run build                    # Build all packages
pnpm run server:build             # Build server only
pnpm run client:build             # Build client only
pnpm run editor-ext:build         # Build editor extensions

# Development
pnpm run dev                      # Run frontend + backend concurrently
pnpm run server:dev               # Backend with watch mode
pnpm run client:dev               # Frontend with HMR
pnpm run collab:dev               # Collaboration server

# Database
pnpm --filter server run migration:latest   # Run all pending migrations
pnpm --filter server run migration:create   # Create new migration
pnpm --filter server run migration:down     # Rollback last migration

# Production
pnpm run start                    # Start production server
pnpm run collab                   # Start production collab server
```

### Accessing the App

- **Frontend**: http://localhost:5174 (dev) or http://localhost:3000 (prod)
- **Backend API**: http://localhost:3000/api
- **Health Check**: http://localhost:3000/api/health

## Code Style & Architecture

### Backend (NestJS)

**Module Structure:**
- Controllers handle HTTP routing (`*.controller.ts`)
- Services contain business logic (`*.service.ts`)
- Repositories handle database queries (`*.repo.ts`)
- DTOs validate inputs (`dto/*.ts`)

**Database:**
- Uses Kysely (TypeScript query builder, NOT an ORM)
- Type-safe SQL queries with full TypeScript support
- Migrations in `apps/server/src/database/migrations/`
- Database types generated from schema

**Permissions:**
- CASL ability-based access control
- Abilities defined in `apps/server/src/core/casl/abilities/`
- Space-based permissions: `ADMIN`, `WRITER`, `READER`
- Workspace-level permissions for global resources

**Key Patterns:**
```typescript
// Repository pattern with Kysely
async getById(id: string): Promise<Entity> {
  return this.db
    .selectFrom('table')
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirst();
}

// Ability checks
@UseAbility(Actions.update, Page)
async updatePage(@Param('id') id: string) { }
```

### Frontend (React + TypeScript)

**Component Structure:**
- Feature-based organization in `src/features/`
- Shared components in `src/components/`
- Custom hooks in `src/hooks/`
- Context providers for state management

**Editor Architecture:**
- TipTap extensions in `packages/editor-ext/`
- Real-time collaboration via Yjs
- Custom extensions for Docmost-specific features

**Styling:**
- Mantine UI components
- CSS modules for custom styles
- Theme system with dark mode support

**Key Patterns:**
```typescript
// Feature-based structure
features/
  editor/
    components/      # Editor-specific components
    hooks/          # Editor hooks
    extensions/     # TipTap extensions
    utils/          # Editor utilities
```

### Database Schema Highlights

**Permission Model:**
- `workspaces` - Top-level tenant
- `spaces` - Collections of pages
- `space_members` - User/Group membership with roles
- `pages` - Documents with tree structure
- `groups` - User groups for bulk permissions

**Space Membership:**
- Members can be users OR groups (enforced by CHECK constraint)
- User's effective permissions = union of direct + group memberships
- Query uses `UNION` to get all roles for a user in a space

## Common Tasks

### Add a new database table

1. Create migration: `pnpm --filter server run migration:create`
2. Edit migration file in `apps/server/src/database/migrations/`
3. Run migration: `pnpm --filter server run migration:latest`
4. Generate types: `pnpm --filter server run migration:codegen`

### Add a new API endpoint

1. Create DTO in service module
2. Add method to controller
3. Implement logic in service
4. Add repository method if database access needed
5. Add ability checks if authorization required

### Extend the editor

1. Create extension in `packages/editor-ext/src/`
2. Export from `packages/editor-ext/src/index.ts`
3. Import and use in `apps/client/src/features/editor/extensions/`

## Environment Configuration

Key environment variables (`.env`):

```bash
# App
APP_URL=http://localhost:3000
APP_SECRET=<32+ character secret>
PORT=3000

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/docmost

# Redis
REDIS_URL=redis://127.0.0.1:6379

# Storage
STORAGE_DRIVER=local  # or s3

# Email
MAIL_DRIVER=smtp      # or postmark
```

## Troubleshooting

**Port conflicts:**
- Check for local PostgreSQL: `lsof -i :5432`
- Stop local instance: `brew services stop postgresql@15`

**Migration issues:**
- Reset database: `docker compose down -v` then recreate
- Check connection: `psql $DATABASE_URL -c "SELECT version();"`

**Build failures:**
- Clean install: `rm -rf node_modules pnpm-lock.yaml && pnpm install`
- Rebuild: `pnpm run build`
