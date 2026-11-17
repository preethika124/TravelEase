# TravelEase

Independent travel and hotel booking platform with a React/Vite frontend, Express/TypeScript API, and PostgreSQL persistence. The checkout is simulated and never collects card credentials, UPI PINs or OTPs.

## Quick start

Requirements: Node.js 20+, npm and PostgreSQL 14+.

```powershell
Copy-Item .env.example backend\.env
# Edit backend\.env with DATABASE_URL, JWT_SECRET, AGENT_API_KEY, FRONTEND_URL and PORT.
npm install
npm run db:generate -w backend
npm run db:migrate -w backend
npm run db:seed -w backend
npm run dev
```

Frontend: http://localhost:5173 · API: http://localhost:4000 · Health: http://localhost:4000/api/health

Read [docs/WORKFLOW.md](docs/WORKFLOW.md) for the complete lifecycle, code map, configuration details and commands. Current endpoint contracts are in [docs/API.md](docs/API.md).

## Layout

```text
frontend/      React, Vite, TypeScript customer application
backend/       Express API, Prisma schema, migrations and seed
 database/     Database notes
 docs/         API and workflow guides
 tests/        Playwright end-to-end project
```

The demo seed is safe to rerun. Booking prices are calculated server-side; seat and dated room inventory are rechecked within the booking transaction. Create requests require authenticated customer identity, explicit confirmation and an idempotency key. The independent AgentPlatform calls the same TravelEase transaction service through its separate agent API.
