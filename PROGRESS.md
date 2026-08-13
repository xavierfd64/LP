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

### Phase 2 — Core lifecycle ✅
- Inquiries: customer self-submit (or staff on behalf of a customer), list, detail, staff "Close Inquiry" action.
- Quotations: staff creates from an inquiry (or from scratch) with a dynamic multi-line-item form (client-managed rows, total computed live), Draft → Send → Approve/Reject flow. Approving an inquiry-linked quotation flips the inquiry to `QUOTED`.
- Orders: staff creates an order directly or from an approved quotation, choosing `STANDARD_PARTIAL` (with a configurable required-partial %) or `APPROVED_TERMS` (captures who authorized it and why — both logged to the audit trail). Auto-numbered `ORD-YYYY-####`.
- Job Orders: staff adds one or more JOs to an order, each bound to an active Workflow Template; auto-numbered `JO-###` scoped to the order (fixed the schema to make `joNumber` unique per-order rather than globally, since every order legitimately starts its own `JO-001`).
- Order detail page shows payment-term info, a live payment summary (confirmed vs. required-partial vs. total), and the JO list with a "Start Production" action per JO.
- "Start Production" wires straight into `lib/workflow.ts`'s `startProduction()` — this is Rule #1 from Section 7, enforced now rather than deferred to Phase 3, since the gate logic and the JO-creation flow are naturally the same piece of work. Verified end-to-end (Playwright-driven browser test against the running dev server + seeded DB): attempting to start production on an unpaid `STANDARD_PARTIAL` order is blocked with `On hold: requires 1000.00 confirmed partial payment (has 0.00), or an approved payment-terms exception.`, and the JO stays `ON_HOLD`.
- Job Order detail page (baseline version): header info, full stage list from its template with the current stage highlighted, and stage-log history. Stage-advance UI, QC, files, and fulfillment are added in later phases.

### Phase 3 — Payment & terms gate ✅
- `/payments`: staff/admin view of every payment across all orders, with a "Record Payment" form (creates a `CONFIRMED` payment directly) and Confirm/Reject actions for `PENDING` ones.
- Customer-side "Upload Payment Proof" on the order detail page: amount + file upload, creates a `PENDING` payment with the proof file linked (`lib/upload.ts`); staff then confirms or rejects it from `/payments`.
- Order detail page shows full payment history (date, amount, method, status, proof link) alongside the live payment summary from Phase 2.
- Rule #2 (Section 7) — a JobOrder cannot be `RELEASED` without full payment or an authorized release exception — implemented as `assertCanRelease()` in `lib/workflow.ts` and wired to a "Release" action (shown once a JO reaches `READY`, from `/orders/[id]` and `/job-orders/[id]`).
- "Grant Release Exception" form on the order page captures who authorized it and why (mirrors the approved-terms exception from Phase 2), audit-logged as `RELEASE_EXCEPTION_GRANTED`.
- Verified end-to-end against the seeded DB (Playwright-driven browser runs, cross-checked against server logs and direct DB queries, then reverted the test mutations):
  - Recording a `CASH`/etc. payment that meets the required partial % correctly unblocks "Start Production" (`ON_HOLD` → `IN_PROGRESS`).
  - Attempting to release a `READY` JO on an order that's only 50% paid is blocked with `Cannot release: full payment required (7500.00 of 15000.00 confirmed), or an authorized release exception.` and the JO stays `READY`.
  - Granting a release exception (audit-logged) immediately unblocks the same JO's release (`READY` → `RELEASED`), and the audit trail records both `RELEASE_EXCEPTION_GRANTED` and `JOB_ORDER_RELEASED`.

### Phase 4 — Workflow templates + Production portal (next)
...

## Known Stubs

- **SMS/Email notifications** — `lib/notify.ts` just does `console.log('[STUB NOTIFY] ...')`. A real build would wire this to Twilio/SendGrid.
- **Payment gateway** — payments are manually recorded by staff or uploaded as proof by the customer; nothing talks to an actual payment processor.
- **Password reset / email verification** — not implemented; note only.
- **Courier tracking** — tracking number/courier are free-text fields, no live courier API integration.
- **Invoice/PDF generation** — not built (spec marks this optional).
- **Object storage** — files are written to local disk (`public/uploads/`) with metadata in the `File` table; a production deployment would swap this for S3-compatible storage behind the same `lib/upload.ts` interface.

(This section will be expanded as later phases add their own stubs.)
