# wa-blast

Standalone WhatsApp marketing platform — blast broadcasts via Meta Cloud API, own auth (Better Auth), pluggable CRM forwarding.

## Getting started

```bash
bun install
cp .env.example .env.local   # fill in values
bun run db:migrate
bun run dev
```

Open http://localhost:3000 and create your account at `/signup`.

## Commands

- `bun run dev` — Next.js dev server (turbopack)
- `bun run build` — production build
- `bun run db:generate` — generate Drizzle migration from schema
- `bun run db:migrate` — apply migrations to the DB
- `bun run db:studio` — Drizzle Studio UI
- `bun run test` — run Vitest suite

## Architecture

See `docs/superpowers/specs/2026-04-21-standalone-refactor-design.md` for the full design and `docs/superpowers/plans/2026-04-21-standalone-refactor.md` for the implementation plan.

Three internal services share one SQLite DB:
1. **Web UI** — Next.js App Router with Better Auth session gating.
2. **Sender worker** — In-process background dispatcher (rate-limited) calling Meta Cloud API.
3. **Webhook proxy** — Single `/api/webhook/meta` endpoint, verifies Meta signatures, processes delivery/opt-out events, forwards raw payload to an optional external CRM URL.
