# Application architecture

```mermaid
flowchart LR
  Browser[React + Vite + TypeScript\nTravelEase frontend] -->|HTTPS JSON REST, customer JWT| API[Express + TypeScript\nTravelEase API]
  Agent[Separately operated external agent] -->|x-agent-key + user JWT\nvalidated REST calls| API
  API --> Prisma[Prisma ORM]
  Prisma --> DB[(PostgreSQL\nTravelEase tables)]
  API --> Demo[Simulated payment handler\nNo real payment credentials]
```

Frontend and backend run independently. The frontend owns presentation and user input; the API validates requests and enforces identity, confirmation, idempotency and ownership; PostgreSQL stores booking records. The external agent is a future API client and is not embedded in this repository.
