# TravelEase workflow and code map

TravelEase is an independent React/Vite browser app and Express/TypeScript API. PostgreSQL is the source of truth for users, catalogue, inventory, drafts, bookings, passengers and demo payment records. The browser does not contain a parallel catalogue or calculate authoritative prices.

## End-to-end customer workflow

1. **Search** — `frontend/src/App.tsx` builds search URLs. `GET /api/flights/search` and `GET /api/hotels/search` query the database and return live availability. Flight filters cover route, departure date, passenger count, price and airline; hotel filters cover destination, date overlap, room count, guest capacity, rating and nightly price.
2. **Select** — Flight details and seat routes load records from the API. Hotel details loads rooms for the selected dates. The UI saves the selection to the authenticated user's server-side booking draft.
3. **Sign in and traveller data** — registration/login set an HttpOnly cookie. `/api/me` checks the session. Passenger and profile updates go through authenticated routes. A booking draft expires after two hours.
4. **Review** — `/api/bookings/preview` re-reads current records, validates passenger/seat/room quantities and calculates authoritative amounts. It has no write side effects.
5. **Confirm** — the page requires a separate confirmation checkbox. `POST /api/bookings` requires the fixed demo approval marker and a unique idempotency header. In a serializable transaction the API rechecks availability and pricing, creates booking/items/passengers/demo payment, claims flight seats and writes dated hotel reservations. Any inventory conflict rolls the transaction back.
6. **Retrieve or cancel** — booking history and detail queries are owner scoped. Cancellation transaction marks the booking cancelled, demo payment refunded, releases seats and marks room reservations cancelled.
7. **Agent integration** — AgentPlatform calls the dedicated TravelEase agent routes with a machine key; operations on a customer booking also require that customer's JWT. It uses the same validators and booking service, so it cannot bypass confirmation, authoritative prices or inventory locking.

## Important files

### Frontend

- `frontend/src/main.tsx` mounts React and the router.
- `frontend/src/App.tsx` contains routes and customer journey screens: home/search, results, details, seats, passenger form, preview, simulated checkout, confirmation, history, profile and authentication.
- `frontend/src/api.ts` configures the API origin, cookie credentials, response unwrap helpers and session-expiry event.
- `frontend/src/style.css` provides the shared visual design and responsive states.
- `frontend/src/App.test.tsx` is a component smoke test; Vitest config lives in `frontend/vite.config.ts`.

### Backend

- `backend/src/index.ts` defines Express middleware, request IDs/logging, CORS/security headers, input schemas, authentication, search/profile/draft/booking routes, agent routes and safe errors.
- `backend/src/services/bookings.ts` owns booking schemas, server price/availability preview, request hashing, transactional create and cancellation.
- `backend/prisma/schema.prisma` is the data model.
- `backend/prisma/migrations/` contains the initial schema and additive booking/inventory migration.
- `backend/prisma/seed.ts` inserts stable demo records; it is safe to rerun and does not clear inventory.

### Tests and docs

- `tests/` contains Playwright end-to-end checks.
- `docs/API.md` lists current request and response contracts.
- `database/README.md` contains database notes.

## Local setup (PowerShell)

Prerequisites: Node.js 20+, npm, PostgreSQL 14+.

```powershell
cd C:\Users\penta\Documents\PROJECTS\final_project\TravelEase
Copy-Item .env.example backend\.env
```

Edit `backend\.env` and set:

- `DATABASE_URL`: PostgreSQL connection string. Create the `travelease` database first, or adjust the DB name in the URL.
- `JWT_SECRET`: a private random string (32+ random bytes recommended).
- `AGENT_API_KEY`: a separate private machine key for AgentPlatform integration.
- `FRONTEND_URL`: browser origin, normally `http://localhost:5173`.
- `PORT`: normally `4000`.

Use a password manager/secret manager for production secrets. Do not commit either `.env` file. Then run:

```powershell
npm install
npm run db:generate -w backend
npm run db:migrate -w backend
npm run db:seed -w backend
npm run dev
```

Open `http://localhost:5173`; API health is `http://localhost:4000/api/health`, and API markdown is served at `http://localhost:4000/api-docs`. Seed flight departures are 33 days from when the seed is run. Hotel data is seeded in Hyderabad, Bengaluru and Mumbai.

To stop servers press Ctrl+C. To run checks:

```powershell
npm run build
npm run test -w frontend
npm run test:e2e -w tests
```

Playwright may require a one-time browser install: `npx playwright install chromium`.

## Production notes

Set production secrets and `NODE_ENV=production`, serve both app and API over HTTPS, set `FRONTEND_URL` to the exact deployed browser origin, use managed PostgreSQL and apply committed migrations with `npx prisma migrate deploy` from `backend`. The payment integration is intentionally a simulation. Production checkout is disabled by default; set `PAYMENT_MODE=demo` and `ALLOW_SIMULATED_CHECKOUT_IN_PRODUCTION=true` in the backend environment to explicitly enable the simulation. Do not interpret `SUCCEEDED` demo payment rows as real financial transactions.
