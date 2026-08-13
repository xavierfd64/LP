# LP Printing — Business Management System (MVP prototype)

A broad-but-shallow prototype covering the full printing-business lifecycle: Inquiry → Quotation → Approval → Order → Job Orders → Production → QC/Rework → Fulfillment → Rewards, across four role-based portals (Admin, Staff, Production, Customer).

See `PROGRESS.md` for what's built vs. stubbed.

## Stack

Next.js 16 (App Router, TypeScript) · PostgreSQL + Prisma 7 · NextAuth v5 (Credentials) · Tailwind CSS · Zod

## Setup

### Option A — `npm run dev` with a local Postgres

1. Have a PostgreSQL server reachable (locally installed, or `docker run -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:16`).
2. Copy env vars:
   ```bash
   cp .env.example .env   # or edit .env directly
   ```
   Set `DATABASE_URL` to point at your Postgres instance, e.g.:
   ```
   DATABASE_URL="postgresql://postgres:postgres@localhost:5432/printbiz?schema=public"
   NEXTAUTH_SECRET="some-random-string"
   NEXTAUTH_URL="http://localhost:3000"
   AUTH_SECRET="some-random-string"
   ```
3. Install deps, generate the Prisma client, run migrations, and seed:
   ```bash
   npm install
   npx prisma generate
   npx prisma migrate deploy   # or: npx prisma migrate dev
   npx prisma db seed
   ```
4. Run the app:
   ```bash
   npm run dev
   ```
   Visit http://localhost:3000.

### Option B — `docker-compose up`

```bash
docker-compose up --build
```
This starts Postgres + the app, runs migrations, and seeds the database automatically. Visit http://localhost:3000.

## Demo logins

All seeded passwords are `password123`.

| Role | Email |
|---|---|
| Admin | admin@lp.test |
| Staff | staff1@lp.test / staff2@lp.test |
| Production | prod1@lp.test / prod2@lp.test |
| Customer | juan@lp.test / maria@lp.test / ramon@lp.test |

New customers can also self-register at `/register`.

## Useful scripts

```bash
npm run db:migrate   # prisma migrate dev
npm run db:seed      # prisma db seed
npm run db:studio    # prisma studio (browse the DB)
npm run db:reset     # drop + recreate + reseed (destructive)
```

## Notes

- Uploaded files are stored on local disk under `public/uploads/` (see `PROGRESS.md` — production would use S3-compatible object storage).
- SMS/email notifications are stubbed to `console.log` (`lib/notify.ts`).
