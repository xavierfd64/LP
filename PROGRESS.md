# PROGRESS

Broad-but-shallow MVP prototype of the Printing Business Management System, built per `BUILD_SPEC.md` (the original prompt).

## Stack decisions

Followed the recommended stack with a couple of environment-driven adjustments:

- **Next.js 16** (App Router, TypeScript, Turbopack) instead of 14 — that's what `create-next-app` shipped; no functional difference for this build.
- **PostgreSQL 16**, running as a local system service in this container (not docker-compose) because no Docker daemon was available in this sandbox. `docker-compose.yml` is still provided and documented in the README for normal local use.
- **Prisma 7** (`prisma-client` generator, not the older `prisma-client-js`) — this is what `prisma init` scaffolds on v7 and requires a driver adapter (`@prisma/adapter-pg`). Generated client lives at `app/generated/prisma` (gitignored, run `npx prisma generate`).
- **NextAuth v5 (Auth.js beta)** with the Credentials provider. Auth config is split into `lib/auth.config.ts` (Edge-safe, no Prisma/bcrypt — used by `proxy.ts`) and `lib/auth.ts` (full config with the Credentials provider — used by server code). This split is required because Next's Edge Middleware/Proxy runtime can't load Prisma's Node-only client.
- Route protection file is named `proxy.ts` (Next 16 renamed the middleware convention to "proxy").
- Hand-rolled a small Tailwind component kit under `components/ui/` (Button, Card, Badge, Input/Select/Textarea, Table, Alert) instead of running the `shadcn` CLI, to avoid an interactive scaffolding step — same visual approach (Tailwind + simple composable primitives), just written by hand.
- File uploads are stored under `public/uploads/` (not a top-level `/uploads/`) so Next's static file server handles them for free without a custom route handler.

## Phases completed

### Phase 1 — Foundation ✅
- Full Prisma schema covering every entity in the spec (User, Customer, Inquiry, Quotation + line items, Order, WorkflowTemplate/Stage, JobOrder, JobOrderStageLog, File, Payment, QCResult, ReworkRecord, InventoryItem, SupplyLot, InventoryMovement, Fulfillment, RewardRule, RewardTransaction, AuditLog).
- Seed script (`prisma/seed.ts`) creates all demo data from Section 10: 1 admin, 2 staff, 2 production, 3 customers (one flagged `isQualifiedForTerms`), 4 workflow templates (Jersey/Tarp/DTF Shirt/Signage) with real stage lists, 6 inquiries, 5 quotations, 3 orders spanning all 4 required JO states (ON_HOLD unpaid, mid-production, QC+rework-in-progress, fulfilled/completed), inventory items+lots (one below reorder threshold), sample files across categories, a reward rule + reward transactions.
- NextAuth credentials login, JWT session carrying `role`, bcrypt password hashing.
- Route protection in `proxy.ts`: unauthenticated → `/login`; wrong role for a gated prefix (`/admin`, `/production`, `/inventory`, `/payments`, `/users`) → redirected to their own home.
- Self-registration for `CUSTOMER` only (`/register`); other roles are created via an Admin screen (Phase 10/11).
- Role-aware shell layout + sidebar nav (`components/layout/`).
- Core cross-cutting libs used by every later phase: `lib/workflow.ts` (payment-gate + stage-advance business rules), `lib/numbering.ts` (order/JO/quote/lot numbering), `lib/audit.ts`, `lib/notify.ts` (stub), `lib/upload.ts`.

### Phase 2 — Core lifecycle (in progress)
...

## Known Stubs

- **SMS/Email notifications** — `lib/notify.ts` just does `console.log('[STUB NOTIFY] ...')`. A real build would wire this to Twilio/SendGrid.
- **Payment gateway** — payments are manually recorded by staff or uploaded as proof by the customer; nothing talks to an actual payment processor.
- **Password reset / email verification** — not implemented; note only.
- **Courier tracking** — tracking number/courier are free-text fields, no live courier API integration.
- **Invoice/PDF generation** — not built (spec marks this optional).
- **Object storage** — files are written to local disk (`public/uploads/`) with metadata in the `File` table; a production deployment would swap this for S3-compatible storage behind the same `lib/upload.ts` interface.

(This section will be expanded as later phases add their own stubs.)
