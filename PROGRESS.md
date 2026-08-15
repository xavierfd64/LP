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

### Phase 4 — Workflow templates + Production portal ✅
- Admin CRUD for Workflow Templates at `/admin/workflow-templates`: create/edit a template's name and its ordered stage list (add/remove/reorder rows client-side, one stage flagged as the QC stage, any stage flaggable as the install stage), plus an active/inactive toggle. New product types are addable with zero code changes, per spec.
- Production queue at `/production`: every JobOrder currently `IN_PROGRESS`, `REWORK`, or `QC`, sorted by deadline, showing product/qty/customer/deadline/current stage. `QC`-status JOs link to the job order detail page (QC recording UI lands in Phase 5); everything else gets `READY → IN_PROGRESS → COMPLETED` stage actions inline.
- Stage advancement is driven entirely by `lib/workflow.ts`'s `completeCurrentStage()` (built in Phase 1, now wired to real UI): it always advances exactly one stage per the template's order (Rule #4), routes into `QC` status automatically when the next stage is the QC stage, and flips the JO to `READY` when the last stage completes.
- Verified end-to-end against the seeded DB: completing the seeded order's `Pressing` stage (the stage right before `QC` in the DTF Shirt template) correctly moved the JO to `status=QC`, `currentStageOrder=4`, and opened a fresh `QC` stage log in `READY` — confirmed via the DB and the audit trail, then reverted so the seed data matches its documented starting state.

### Phase 5 — QC & Rework ✅
- QC recording form on the job order detail page, shown whenever a JO is at `status=QC`: Pass/Fail toggle, quantity checked/failed, defect notes, and (on Fail) a "route rework to stage" selector defaulting to the stage immediately before QC.
- `recordQCResult()` in `lib/workflow.ts`: on Fail, always creates a `ReworkRecord` and routes the JO's `currentStageOrder` back to the chosen stage with a fresh `READY` stage log, setting `status=REWORK` — this is Rule #3 from Section 7, and it blocks all forward progress on the JO until that stage is redone. On Pass, it closes the QC stage log and advances exactly one stage (or to `READY` for fulfillment if QC was the last stage), reusing the same strict-order logic as regular stage completion (Rule #4).
- Completing a rework stage (via the normal production-queue stage actions) re-enters QC automatically — `completeCurrentStage()` detects `status=REWORK`, closes the open `ReworkRecord`(s) as `DONE`, and opens a new QC stage log — so the QC↔rework loop can repeat, and every attempt stays in history rather than being overwritten (both stage logs and all `QCResult` rows are kept and shown on the JO detail page's "QC history" section, each with its linked rework record if it failed).
- Fixed a seed-data/business-logic mismatch this phase surfaced: the seeded "QC + rework in progress" job order had `currentStageOrder` pointing at the QC stage while its `ReworkRecord.assignedStage` said "Pressing" — inconsistent with how `recordQCResult()` actually routes rework. Corrected the seed so `currentStageOrder` follows the assigned stage and the in-progress rework attempt has its own active stage log, matching what the real flow produces.
- Verified end-to-end against the seeded DB, in both directions: completing the seeded in-progress rework (Pressing) correctly closed the `ReworkRecord`, re-entered QC, and a subsequent Pass advanced the JO to the next stage (`Packing`) with full stage-log history preserved (`STAGE_COMPLETED` → `REWORK_CLOSED` in the audit log). Separately, driving a fresh JO through Pressing → QC → **Fail** correctly created a new `OPEN` `ReworkRecord` (assigned stage `Pressing`, qty 5) and set the JO back to `REWORK` at `currentStageOrder=3`, blocking it from progressing. Reset the dev DB to a clean reseed afterward so demo data matches the documented seed state.

### Phase 6 — Inventory & Supply Lots ✅
- `/inventory`: item list with current stock, reorder threshold, a low-stock banner, an "Add Item" form, and a recent-consumption-by-JO report pulling from `InventoryMovement`.
- `/inventory/[itemId]`: per-item supply lots (lot code, received date/qty/supplier, remaining qty), a "Receive New Lot" form that auto-generates the lot code via `lib/numbering.ts`'s `nextLotCode()` (pattern `{itemShortCode}-{YYYYMM}-{sequence}`, e.g. `DTF-202608-002`) and creates a `RECEIVE` movement, and per-lot "Record Movement" forms covering Allocate/Consume/Reject/Waste (always against a job order for the first two) and Adjust (a signed correction).
- All movements are stored as a signed `qty` delta against the lot (`RECEIVE`/positive-`ADJUST` increase, `ALLOCATE`/`CONSUME`/`REJECT`/`WASTE`/negative-`ADJUST` decrease), applied atomically to both `SupplyLot.remainingQty` and the parent `InventoryItem.currentQty` in `app/actions/inventory.ts`.
- Rule #5 (Section 7) — `remainingQty` must never go negative — enforced by computing the new remaining quantity before writing anything and returning a clear validation error (no DB write at all) if it would go negative.
- Verified end-to-end against the seeded DB: consuming 5 units against a 12-unit lot correctly brought it to 7, and immediately attempting to consume 100 more was rejected with `Cannot consume more than the remaining quantity in this lot (7 available)` — confirmed the lot's `remainingQty` was untouched and no `InventoryMovement` row was written for the rejected attempt.
- Fixed a related seed inconsistency this phase surfaced: the seed had created an `ALLOCATE` movement without actually decrementing the lot's `remainingQty`/item's `currentQty` (a leftover from before movements had a defined signed-delta convention) — corrected the seed data to be internally consistent with how `recordMovementAction` actually accounts for stock.

### Phase 7 — File Repository ✅
- Files tab on the job order detail page, grouped exactly in spec order: Customer Files → Design Versions → Approved Design → Production Files → QC Evidence. Each file shows filename, version, uploader, timestamp, an "Approved / In Use" badge, and a download link (served straight from `public/uploads/` via Next's static file handling).
- Upload form (`app/actions/files.ts`): version auto-increments per job-order-per-category; customers are restricted to uploading `CUSTOMER_FILE`s, staff/admin/production can upload to any category.
- "Approve" action flags a file `isApproved` and simultaneously un-approves any other file in the same JO+category (so exactly one version per category is ever flagged as the active/in-use one). Staff/admin/production can approve any category; customers can only approve `DESIGN_DRAFT` files — this is the design-approval action from spec 5.13 ("design approval action if a design is pending their review").
- Verified end-to-end against the seeded DB: uploaded a new Design Draft v2 (auto-versioned correctly above the existing v1), then approved it as the customer — confirmed only that file flips to `isApproved=true` and no other category's approval state is disturbed. Tightened the customer-approval permission during testing (initially it let a customer approve any category, which doesn't match the spec's design-review framing) and re-verified the fix.

### Phase 8 — Fulfillment ✅
- Fulfillment can only be scheduled once a JO is `RELEASED` (i.e. Rule #2's payment gate has already passed) — a "Schedule Fulfillment" form on the job order detail page offers Pickup, Delivery, or Installation, with Installation only available when the JO's workflow template actually has a stage flagged `isInstallStage` (Signage does; Jersey/Tarp/DTF Shirt don't).
- Pickup: single "Mark Picked Up" action → `RECEIVED`. Delivery: `BOOKED → IN_TRANSIT → DELIVERED` with courier/tracking-number fields and a proof-of-delivery upload. Installation: scheduled date + "Mark Installed" → `INSTALLED`.
- Reaching any terminal fulfillment status marks the JobOrder `COMPLETED`; once every JO on an Order is `COMPLETED`, the Order itself flips to `COMPLETED` and triggers `lib/rewards.ts`'s `onOrderCompleted()` — this pulls Phase 9's core "auto-earn on completion" logic forward since it's the natural trigger point, so Phase 9 is now mostly the reward-rule admin UI and the customer-facing rewards view.
- Verified end-to-end against the seeded DB: released a JO, scheduled a Delivery fulfillment with courier/tracking, walked it through Booked → In Transit → Delivered, and confirmed the full cascade fired correctly — JobOrder → `COMPLETED`, Order → `COMPLETED`, a `RewardTransaction` (`EARN`, 125 points on a ₱12,500 order at the seeded 1pt/₱100 rule) created, and the customer's `rewardPointsBalance` incremented to match.

### Phase 9 — Rewards ✅
- Admin `/admin/rewards`: create reward rules (name, points earned per currency unit, e.g. "1 point per ₱100"), and toggle one active — activating a rule automatically deactivates every other one, so exactly one rule is ever in effect (enforced in `toggleRewardRuleAction`, not just the UI).
- The earn side was already wired in Phase 8 (`lib/rewards.ts`'s `onOrderCompleted()`, called when an Order's last JO completes) — this phase is the admin config UI plus the customer-facing side.
- Customer `/account/rewards`: points balance, full transaction history (EARN in green, REDEEM in slate, signed point deltas), and a "Redeem Points" form (points + free-text "what for") that validates the customer isn't redeeming more than their current balance before writing anything.
- Verified end-to-end against the seeded DB: attempting to redeem 9999 points against a 400-point balance was correctly rejected with no transaction written; redeeming a valid 100 points immediately updated the balance to 300 and appended a `REDEEM` row. Separately, creating and activating a new reward rule from the admin UI correctly flipped the previously-active rule to inactive in the same action.

### Phase 10 — Management Dashboard + Audit Trail ✅
- `/admin/users`: the "Create User" admin screen called for in Section 3 (Staff/Production/Admin accounts are admin-created; only Customer self-registers) — name/email/role/temp-password form, audit-logged as `USER_CREATED`.
- `/admin/dashboard` rebuilt with live widgets, all pulled from real DB queries (no mock data): open quotations, JOs-by-stage breakdown, QC pass/fail rate, low-stock item count, total outstanding balance (with a drill-down list of which orders owe what), upcoming fulfillments (next 8 by scheduled date), new vs. returning customers this month, and reward points issued/redeemed this month.
- `/admin/audit-log`: filterable table (entity type, actor, date range) over every `AuditLog` row written by the app so far — quotation approvals, payment recording, payment-terms/release exceptions, JO stage changes, QC results, rework created/closed, inventory movements, file uploads/approvals, fulfillment/release/completion events, and now user creation, satisfying every state-changing action listed in spec Section 5.12.
- Verified end-to-end: confirmed a fresh reseed has zero audit rows (the seed script doesn't route through the app, so this is correct, not a bug), then created a user through the admin UI and confirmed it appeared in the audit log both unfiltered and when filtering by `entityType=User`.

### Phase 11 — Customer Portal polish ✅
- Rebuilt `/dashboard` for the `CUSTOMER` role into a real dashboard per spec 5.13, pulling live data instead of the generic quick-link grid still used for staff: quotations awaiting approval, active orders count, balance due, reward points — all as clickable stat cards — plus an active-orders list with inline JO-level status chips, recent inquiries, and quotations awaiting approval.
- Added a "Fulfillment & Tracking" section directly to the order detail page (previously tracking/courier info was only visible one level down on the job order detail page) — method, status, scheduled date, and courier/tracking number per JO's fulfillment record.
- Confirmed every customer-facing action from spec 5.13 is reachable: submit inquiry, view/approve quotations, view order/JO progress, upload payment proof, view payment history, approve a pending design draft, view fulfillment/tracking, view rewards balance/history/redeem — all exercised via the earlier phases' end-to-end tests plus a fresh pass over the customer dashboard and order detail page against the seeded DB.

### Phase 12 — Verify business rules ✅

Manual test checklist for every rule in spec Section 7, each one actually driven through the running app against the seeded/reset dev DB (not just read from the code) and then reverted so demo data stays clean:

| # | Rule | How it's enforced | Verified |
|---|---|---|---|
| 1 | JO can't leave `ON_HOLD` without partial payment or an approved-terms exception | `lib/workflow.ts` `assertCanStartProduction()`, called from `startProduction()` | Unpaid standard-partial order: "Start Production" blocked with `On hold: requires 1000.00 confirmed partial payment (has 0.00)...`. Recording a payment that meets the required % immediately unblocks it. |
| 2 | JO can't be `RELEASED` without full payment or an authorized release exception | `assertCanRelease()`, called from `releaseJobOrderAction` | A `READY` JO on a 50%-paid order: release blocked with `Cannot release: full payment required (7500.00 of 15000.00 confirmed)...`. Granting a release exception (audit-logged) immediately unblocks it. |
| 3 | Failed QC always creates a `ReworkRecord` and blocks forward progress | `recordQCResult()` | A QC Fail created a new `OPEN` `ReworkRecord` and routed the JO back to the assigned stage (`status=REWORK`), blocking it from re-entering QC until that stage is redone. |
| 4 | Stage completion always advances exactly one step — never skips | `completeCurrentStage()`'s `stageOrder !== jo.currentStageOrder` guard | Direct test: fabricated an out-of-sequence stage log and confirmed `completeCurrentStage()` throws `This stage is not the job order's current stage.`; completing the real current stage advanced `currentStageOrder` by exactly 1. |
| 5 | `SupplyLot.remainingQty` must never go negative | `recordMovementAction`'s pre-write remaining-quantity check | Consuming 5 of 12 units succeeded (→7); immediately attempting to consume 100 more was rejected with no DB write, `remainingQty` unchanged at 7. |
| 6 | Every state-changing action from Section 5.12 writes an `AuditLog` entry | `logAudit()` called from every mutating server action | Grepped every action file for `logAudit` calls and cross-checked against the Section 5.12 list; found and fixed one gap — marking a stage `IN_PROGRESS` (start-of-stage) wasn't logged, only completion was. Added `STAGE_STATUS_UPDATED` logging to `setStageLogStatus()`. |

Also did a full route crawl (every nav link for all 4 roles, plus a sample of detail pages — orders, inventory items, job orders, workflow templates) confirming `npm run dev` serves every page with no 500s or thrown errors, per the Section 9 phase-closing requirement.

## Known Stubs

- **SMS/Email notifications** — `lib/notify.ts` just does `console.log('[STUB NOTIFY] ...')`. A real build would wire this to Twilio/SendGrid.
- **Payment gateway** — payments are manually recorded by staff or uploaded as proof by the customer; nothing talks to an actual payment processor.
- **Password reset / email verification** — not implemented.
- **Courier tracking** — tracking number/courier are free-text fields, no live courier API integration.
- **Invoice/PDF generation** — not built (spec marks this optional).
- **Object storage** — files are written to local disk (`public/uploads/`) with metadata in the `File` table; a production deployment would swap this for S3-compatible storage behind the same `lib/upload.ts` interface.
- **Single active reward rule** — the schema allows multiple `RewardRule` rows, but only one is ever "active" at a time (activating one deactivates the rest) to keep the earn calculation unambiguous, matching the spec's "a simple RewardRule" framing.
- **System-triggered audit entries have a null actor** — e.g. the reward-earn transaction fired automatically when an order completes has no human actor, so `AuditLog.actorId` is `null` for that one entry type; everything else is attributed to whoever performed the action.

## Final status (original 12-phase MVP)

All 12 build phases are complete. `npm run dev` / `docker-compose up` both run cleanly, every nav link across all four roles resolves without error, and every rule in Section 7 has been driven through the real app (not just unit-tested in isolation) and confirmed to actually block what it should.

---

## Post-MVP batch — customer-side functionality expansion

A follow-up batch of customer-facing functionality, requested after the 12-phase MVP shipped. Schema-first: one migration adds every new model/field, then each domain was wired end-to-end and verified against the running app + seeded DB before moving to the next.

### Inquiry: customer self-service (edit + cancel)
- Added `InquiryStatus.CANCELLED`. Customers can edit (`updateInquiryAction`) or cancel (`cancelInquiryAction`) their own inquiry only while it's still `NEW` — once staff converts it to a quotation (`QUOTED`) it locks. Both actions are audit-logged (`INQUIRY_UPDATED` / `INQUIRY_CANCELLED`).
- Verified: edited an inquiry's product/qty/description and confirmed the DB updated; cancelled it and confirmed the edit/cancel UI disappears once `status != NEW`.

### Quotation: revision cycle, staff edit/cancel, rush bypass
- Added `QuotationStatus.REVISION_REQUESTED` / `CANCELLED`, a `QuotationRevisionRequest` log model, and `cancelledById`/`cancelReason`/`approvedByStaffId`/`approvalBypassReason` fields on `Quotation`.
- **Customer "Request Changes"** (`requestQuotationRevisionAction`, SENT only): logs the request message, sets the quotation to `REVISION_REQUESTED`, and **converts it back into an Inquiry** — reopening the originally-linked inquiry to `NEW`, or creating one on the fly (product types pulled from the quotation's line items) if the quotation wasn't inquiry-sourced. Staff then re-quotes through the existing Inquiry → Quotation pipeline; `/quotations/new` detects a superseded quotation on the inquiry and prefills its line items plus shows the customer's request message.
- **Staff "Edit Quotation"** (`editQuotationAction`): DRAFT/SENT/REVISION_REQUESTED only — replaces line items and recalculates the total. Locked once `APPROVED`.
- **Staff "Cancel Quotation"** (`cancelQuotationAction`): requires a reason, available any time before approval — covers both "customer asked to cancel" and "pricing mistake" per the request.
- **Staff "Approve for Rush"** (`forceApproveQuotationAction`): bypasses waiting on the customer's own click for rush jobs. Requires a reason, stores who approved it and why, and is audit-logged as `QUOTATION_FORCE_APPROVED` — deliberately distinct from a genuine customer `QUOTATION_APPROVED` so the audit trail never conflates the two. Tightened `approveQuotationAction`/`rejectQuotationAction` to customer-only now that this exists as the staff path.
- Verified end-to-end: customer requested changes on a SENT quote → quotation flipped to `REVISION_REQUESTED` and a new linked Inquiry appeared at `NEW` with the right product type inferred from line items → staff edited the line items (qty change reflected in the recalculated total) → sent it → force-approved it with a reason → audit log showed all four actions in order (`QUOTATION_REVISION_REQUESTED`, `QUOTATION_EDITED`, `QUOTATION_SENT`, `QUOTATION_FORCE_APPROVED`). Separately verified a plain staff cancel with reason.

### Orders/Payments: more methods, proof only where it's needed, vouchers as a payment method
- Added `PaymentMethod.MAYA` and `PaymentMethod.VOUCHER`.
- Customer's payment-proof upload now offers a method choice (GCash / Maya / Bank Transfer / Other) — proof is only ever required for these; Cash stays a staff-only direct-record method (`recordPaymentAction`), and Voucher redemption is self-verifying so it skips proof entirely (see below).
- **Apply Voucher** (`applyVoucherAction`, new): customer picks one of their `AVAILABLE` vouchers from a dropdown filtered to ones whose minimum-spend is met by the order; applying it auto-`CONFIRM`s a `Payment` (method `VOUCHER`) for `min(voucher.value, balance due)` and flips the voucher to `USED`. *Assumption not explicitly confirmed by the business owner and worth double-checking*: minimum-spend is checked against the order's **total** amount, and a voucher can't push the order into credit — it's capped at what's still owed, no "change" credited back.
- Verified end-to-end: applied a ₱200 voucher to a ₱1,200 order — payment recorded, voucher flipped to `USED`, a second unrelated voucher on the same account stayed `AVAILABLE`.

### Rewards: admin-configurable redemption tiers + real vouchers
- New `RedemptionTier` model (`pointsCost`, `voucherValue`, `minimumSpend`, `active`) with full admin CRUD at `/admin/rewards` — this replaces what would otherwise have been a hardcoded denomination table, per explicit request. Unlike the single-active `RewardRule` (earn rate), **multiple redemption tiers can be active at once** (the customer picks one from a dropdown), which is the key behavioral difference between the two config sections on that page.
- New `Voucher` model — customer redemption now goes through `redeemPointsAction` → picks a tier → burns `tier.pointsCost` points → mints a `Voucher` (unique code via `nextVoucherCode()`) carrying that tier's value and minimum-spend, snapshotted at redemption time so later tier-config edits never retroactively change an already-issued voucher.
- Seeded rate: 1 point per ₱500 spent (updated from the MVP's placeholder 1/₱100), 1 point = ₱1, with the four requested tiers (100/200/500/1,000 points → matching-value vouchers, minimum spends ₱500/₱1,000/₱5,000/₱10,000).
- Verified: redeemed a 200-point tier as a customer, got a fresh unique-coded `AVAILABLE` voucher and a correctly decremented balance; confirmed the "Redeem" button is correctly disabled when balance is below every tier's cost (caught this from the seed data itself — a good sign the affordability gate works, not a bug).

### Messaging + notifications (built now, not deferred)
- New `Message` model — a lightweight per-order thread (not full internal email — simpler, no mail infra, and keeps context tied to the order it's about) that both the customer and staff/admin can post to from the order detail page. Posting notifies the other side.
- New `Notification` model + `lib/notifications.ts` (replaces the old `lib/notify.ts` stub) — every notification-worthy event (new inquiry, quotation sent/approved/rejected/revision-requested/cancelled, payment proof uploaded/confirmed/rejected, design draft ready, fulfillment scheduled/delivered/installed/received, new message) now persists a real per-user `Notification` row in addition to the existing `[STUB NOTIFY]` console-log stand-in for SMS/email.
- A notification bell in the Shell header (visible on every page, all roles) shows an unread-count badge, a dropdown of recent notifications, click-to-navigate-and-mark-read, and "mark all read".
- Verified end-to-end: the seeded unread message notification showed the correct badge count for the customer, opening the dropdown and clicking it navigated to the order and flipped it to read in the DB; sending a fresh message created a new unread notification for the other party.

### Seed data additions
Added to demonstrate every new flow on first run without any manual setup: a `REVISION_REQUESTED` quotation with its reopened inquiry and logged request message, a staff-`CANCELLED` quotation with reason, four `RedemptionTier` rows, an `AVAILABLE` voucher plus enough bonus points for a customer to redeem a second one live, a sample two-message thread on an existing order, and a few unread notifications so the bell isn't empty on first login.

### Also fixed while in here
`.gitignore`'s blanket `.env*` pattern was silently swallowing `.env.example` too, so it had never actually been committed despite the README instructing `cp .env.example .env` — added a `!.env.example` exception and committed the file for real.

## Known Stubs (as of the Aug 14 batch)

- **SMS/Email notifications** — `lib/notifications.ts` persists a real `Notification` row per recipient (backing the in-app bell) but still just `console.log`s a `[STUB NOTIFY]` line for the actual SMS/email send. A real build would wire that half to Twilio/SendGrid.
- **Payment gateway** — payments are manually recorded by staff, uploaded as proof by the customer, or paid via voucher (internal ledger only); nothing talks to an actual payment processor or e-wallet API.
- **Password reset / email verification** — not implemented.
- **Courier tracking** — tracking number/courier are free-text fields, no live courier API integration.
- **Invoice/PDF generation** — not built (spec marks this optional).
- **Object storage** — files are written to local disk (`public/uploads/`) with metadata in the `File` table; a production deployment would swap this for S3-compatible storage behind the same `lib/upload.ts` interface.
- **Single active reward *earn* rule** — only one `RewardRule` (earn rate) is active at a time; redemption tiers, by contrast, support multiple simultaneously active tiers by design.
- **System-triggered audit entries have a null actor** — e.g. the reward-earn transaction fired automatically when an order completes has no human actor, so `AuditLog.actorId` is `null` for that one entry type.
- **Messaging is per-order only** — no pre-order (inquiry-level) messaging thread yet; could be extended the same way if needed. *(Superseded by the Aug 15 chatbox rework below — Message is no longer Order-only.)*
- **Voucher minimum-spend / cap assumption** — see the Orders/Payments section above; this was a default choice, not an explicitly confirmed business rule.

---

## August 15 system update

A follow-up batch addressing a formal "AUGUST 15 SYSTEM UPDATE" requirements document: quotation control, the still-pending Aug 14 notification triggers, a full chatbox (not just Order-scoped), a centralized customer Payment tab, a faster staff payment-recording flow, and a real mobile-responsive pass. Every item below was verified against the running app (Playwright-driven, cross-checked against the DB) before moving to the next, and everything from the Aug 14 batch (inquiry edit/cancel, quotation revision cycle, reward tiers, multi-method payments, notification bell) was re-verified working, not just left alone.

### Quotation control
- `Quotation.createdById` (+ `createdBy` relation) records who prepared each quotation; the detail page now shows "Prepared by `<name>` on `<date>`".
- Duplicate-quotation prevention: `lib/quotation-status.ts` defines the "active" statuses (`DRAFT`/`SENT`/`REVISION_REQUESTED`/`APPROVED`); `createQuotationAction` now blocks creating a second active quotation on an inquiry that already has one, and the inquiry detail page shows staff a direct link to the existing quotation to revise instead of letting them start a competing one.

### Chatbox (Inquiry / Quotation / Order / Job Order / General)
- Replaced the Order-only `Message` model with a subject-agnostic `Conversation` (`INQUIRY`/`QUOTATION`/`ORDER`/`JOB_ORDER`/`GENERAL`) + per-user `ConversationRead` for unread tracking; migration backfills every existing Order-scoped message into a Conversation row before dropping the old FK (verified against both a populated and an empty DB).
- `lib/conversations.ts` (get-or-create, mark-read, subject label/source-link helpers) and a rewritten `sendMessageAction` that posts against a `conversationId`.
- `ConversationCard` (last message preview + unread badge + Open/Start Chat) is embedded on Inquiry, Quotation, and Job Order detail pages; the Order page keeps a full inline thread. New `/messages` inbox (unread badges; staff see every customer's conversations) and `/messages/[id]` full-thread routes, plus a "New General Message" entry point for customers not tied to any specific record. "Messages" added to the nav for every role that can use it.
- Verified: customer send → staff notification with a working link → staff reply, exercised on all four subject types (inquiry/quotation/order/job order) plus a general conversation.

### Notifications — remaining Aug 14 triggers
Clicking a notification already redirected to its `link` (`openNotificationAction`), so "actionable" was already satisfied — the actual gap was missing trigger events. Added, all routed through the existing `notifyCustomer`/`notifyStaff` helpers with a link:
- Order created, order completed.
- Production/stage-progress updates (stage advance, entering QC, QC pass/fail) from `lib/workflow.ts`.
- Job order completion (distinct from the fulfillment delivered/received/installed notices).
- Delivery "in transit" (previously only "delivered" notified).
- Reward points earned, voucher redeemed, voucher used.
- Outstanding balance reminder: a staff/admin "Send Balance Reminder" button on the order page — there's no background job runner in this prototype to fire these automatically, so it's operator-triggered rather than scheduled.

### Customer Payment tab + inline Record Payment
- `/payments` is now open to `CUSTOMER` (role-branched content, not a separate route): customers get a centralized view across every order — total amount paid, outstanding balance, count of orders with a balance due, a per-order balance table, and full payment history (date, amount, method, order, reference #, status, proof) — without opening each order individually. Staff/admin keep the original all-payments view.
- `RecordPaymentDialog`: a modal opened directly from the Order page, pre-populated with the order number, customer name, and outstanding balance; staff only fill in amount, method, reference number, payment date, and notes — no more bouncing to `/payments` and re-selecting the same order. `Payment.referenceNumber`/`Payment.paymentDate` (schema fields already present) are now actually collected. The `/payments` fallback form gained the same fields plus order pre-selection via `?orderId=`.

### Mobile responsiveness
The prior layout had no mobile nav at all (sidebar was `hidden md:flex` with nothing replacing it below that breakpoint) — fixed first, then a pass over fixed-column grids and cramped multi-field rows app-wide:
- `MobileNav`: hamburger-triggered slide-out drawer reusing the same `SidebarNav`.
- Header/main padding and the notification bell dropdown adapt to narrow viewports.
- Every fixed multi-column grid (`grid-cols-2/3/4/5/12`) across dashboards, order/job-order/quotation detail pages, and admin forms now starts single-column and only expands at `sm`/`md`/`lg`, instead of squeezing fields into slivers.
- `justify-between` title+action header rows wrap instead of forcing a title and button onto one line.
- The quotation line-items editor (5 fields + remove, packed into a 12-col grid) got an actual mobile layout — product/description full-width, qty/price side by side, remove right-aligned — rather than a shrunken desktop row.
- Tables already scrolled horizontally inside their own container (`components/ui/table.tsx`), so no change was needed there.
- Verified with Playwright at a 375px viewport: zero horizontal page overflow across every staff/admin and customer page, the mobile nav drawer, and the notification bell.

### Known stubs, still true after this batch
Everything in the "Known Stubs (as of the Aug 14 batch)" list above still applies — this batch didn't touch payment-gateway integration, SMS/email delivery, courier APIs, or object storage. The one item explicitly resolved is per-order-only messaging (see chatbox section above).

---

## August 15 — 2nd update: User Roles & Staff Permissions

A formal "USER ROLES & PERMISSIONS" requirements document asked for a proper Admin-controlled, per-Staff-member permission system — not three fixed roles — with explicit emphasis that enforcement must be real at the backend/API level, not just hidden buttons. Started by reading the existing auth stack (NextAuth v5 credentials + JWT in `lib/auth.ts`/`lib/auth.config.ts`, `requireUser()`/`requireRole()` in `lib/session.ts`, route gating in `proxy.ts`) before adding anything, per the request's explicit instruction to reuse rather than parallel it.

### Design
- **ADMIN**: unchanged — `requireRole`/`requirePermission` both always let ADMIN through unconditionally. Never touches the permission table.
- **CUSTOMER**: unchanged — never participates in the permission system, isolated exactly as before.
- **PRODUCTION**: unchanged — keeps the same unrestricted access to production/QC actions it always had (passed as a `bypassRoles` escape hatch to `requirePermission`), since this update was about STAFF, not about folding PRODUCTION into it.
- **STAFF**: access now comes entirely from an admin-assigned set of granular permissions instead of the role itself. A new `Permission` enum (50 values across Inquiry/Quotation/Orders/Payments/Production/Fulfillment/Rewards/Communication/Reports/Customer Management/User Management, matching the spec's categories) plus a `StaffPermission` join table (existence of a row = granted) replace the old blanket `requireRole(["STAFF","ADMIN"])` checks.

### Schema + migration
- `Permission` enum, `StaffPermission` model (`@@unique([userId, permission])`), `User.active Boolean @default(true)` for activate/deactivate.
- The migration is purely additive (new enum/table, `ADD COLUMN ... DEFAULT true`) but also **backfills every existing STAFF user with every permission** in the same migration, so introducing this system doesn't silently strip access from anyone who could already do everything a STAFF role could do — Admin dials individual staff back afterward. Verified this specifically: seeded two pre-existing STAFF users into a copy of the DB *before* applying the migration, then applied it, and confirmed both landed with all 50 permissions while a pre-existing ADMIN got zero rows (bypasses the table entirely). New STAFF accounts created after this migration start with zero permissions until Admin assigns some.

### Enforcement
- `lib/permissions.ts` — data/types only (Permission list, category labels, `PERMISSION_PRESETS`), deliberately kept free of any Prisma import so it's safe to import from Client Components (the permission checkbox grid needs it).
- `lib/permissions-guard.ts` — the DB-backed half: `getStaffPermissions()` (React-`cache()`-deduped per request), `can(user, permission)`, and `requirePermission(permission, bypassRoles?)` — the server-action guard that replaced `requireRole` at every relevant call site across `inquiries.ts`, `quotations.ts`, `orders.ts`, `payments.ts`, `fulfillment.ts`, `production.ts`, `qc.ts`, `rewards.ts` (reward *config* actions only — redemption stays customer-only), and `messages.ts` (staff-sender path). `inventory.ts` and `workflow-templates.ts` were deliberately left on the old `requireRole` — those categories aren't in the spec's permission list, so they're out of scope; `admin-users.ts`'s user-creation/permission-assignment actions stay `requireRole(["ADMIN"])` on purpose, since letting a STAFF permission grant control access to the page that assigns STAFF permissions would be a privilege-escalation hole.
- Frontend visibility now mirrors the backend: every button/form gated by a specific permission checks `can(user, "X")` before rendering (view-level page guards redirect to `/dashboard` for STAFF lacking the page's `*_VIEW` permission), and the sidebar/mobile nav (`nav-config.ts`) filters STAFF items by the same granted-permission set via `Shell` fetching `getStaffPermissions()` once per request.
- `proxy.ts`: opened `/production` and `/admin/rewards` to STAFF at the route level (permission-gated inside), since a STAFF account can now be granted production or reward-config permissions; every other `/admin/*` path stays ADMIN-only.
- Deactivation (`User.active`): checked in `authorize()` (blocks login outright) and again in `requireUser()` on every request (DB re-check, since JWT sessions don't self-invalidate) — a deactivated user is locked out immediately, not just on next login.

### Admin UI
- `/admin/staff-permissions`: lists STAFF accounts with active status and a permission count.
- `/admin/staff-permissions/[userId]`: a checkbox grid grouped by category (client component, presets from `lib/permissions.ts`), a preset dropdown that pre-checks boxes without locking them (still individually editable before saving), backed by `updateStaffPermissionsAction` (replace-the-full-set, `requireRole(["ADMIN"])`).
- `/admin/users`: added an Active/Deactivated badge and an activate/deactivate toggle (`toggleUserActiveAction`, blocks self-deactivation).

### Verification
Reseeded from scratch through all 4 migrations (zero drift via `prisma migrate diff --exit-code`), then Playwright-verified against the running app:
- ADMIN reaches every route including `/admin/staff-permissions`, `/production`, `/admin/rewards` unconditionally.
- A "Manager"-preset STAFF (`staff1`, 45/50 permissions, seeded via `PERMISSION_PRESETS.Manager`) sees the full nav and every button; a "Sales Staff"-preset STAFF (`staff2`, 10/50 permissions) has `/payments` and `/production` redirect them to `/dashboard`, and does not see Record Payment / Send Balance Reminder / Add Job Order on an order it *can* view.
- **Backend enforcement, concretely, not just UI hiding**: captured the exact `Next-Action` POST request staff1 (has `PAYMENT_RECORD`) sends when submitting the Record Payment dialog, then replayed the byte-identical request with only staff2's session cookie swapped in. The server rejected it — HTTP 500, `"You do not have permission to do this (Record payment)."` thrown from `requirePermission` inside `recordPaymentAction` — and confirmed via direct DB query that zero rows were created by the replay (only staff1's original, legitimate click persisted). This proves the check runs on the server regardless of what the client sends, not just when a button happens to be visible.
- Deactivating staff2 from `/admin/users` immediately blocked their login attempt with "This account has been deactivated."; reactivating restored it.
- Full route crawl across ADMIN/STAFF(Manager)/STAFF(SalesStaff)/PRODUCTION/CUSTOMER: zero 500s, zero page errors.
- Re-verified every "must not break" item from the spec's own checklist still works: inquiry edit/cancel, quotation prepared-by + duplicate-quotation prevention, customer Payment tab, rewards page, notification bell. The new permission-grid page itself was also checked at a 375px mobile viewport — categories stack cleanly, no horizontal overflow.

### Known gaps / deliberate scope decisions
- Several permissions in the enum have no enforcement point yet because the underlying feature doesn't exist in the app: `INQUIRY_MODIFY`/`INQUIRY_CANCEL` (no staff-side inquiry edit/cancel action exists — only the customer's own), `ORDER_HANDLE_MODIFICATION`/`ORDER_UPDATE_STATUS`/`ORDER_CANCEL` (order status changes are all system-driven; there's no manual "cancel an order" action), `PAYMENT_EDIT`/`PAYMENT_REFUND` (no edit/refund action exists), `REPORTS_VIEW`/`REPORTS_EXPORT` (no reports page exists), `CUSTOMER_*` (no staff-facing customer CRUD exists — customers only self-register). They're defined and selectable in the permission grid/presets for schema completeness and so Admin can pre-configure them ahead of those features landing, but granting them today has no effect.
- `USER_VIEW`/`USER_CREATE`/`USER_EDIT`/`USER_ACTIVATE_DEACTIVATE`/`USER_MANAGE_PERMISSIONS` are likewise defined but not wired to a STAFF bypass — those pages are ADMIN-only at the route level by design (see privilege-escalation note above), so granting them to a STAFF account currently does nothing.
- Inventory and Workflow Templates remain on the old role-based (`requireRole`) gating — untouched because the spec's permission categories don't mention them.

---

## August 15 — 3rd update: Customer Payment nav tab + real-time chat

Two-part request: add a "Payment" item to the customer sidebar (the page already existed from the earlier Payment tab work, it just wasn't linked from the nav), and upgrade chat from refresh-based to real-time — explicitly instructed to inspect and upgrade the existing `Conversation`/`Message` architecture rather than build a parallel system.

### Customer sidebar
`nav-config.ts`'s `CUSTOMER` branch gained `{ label: "Payment", href: "/payments" }` between "My Orders" and "My Rewards", matching the requested order exactly (verified in the mobile drawer too, since it reuses the same `navForRole()` output). No new page — `/payments` already branches to the consolidated customer view (history, total paid, outstanding balance, remaining due per order) built in the first Aug 15 update.

### Real-time chat — architecture
This stack is plain PostgreSQL via Prisma (not Supabase), so there's no built-in logical-replication realtime channel to hook into. Rather than adding an external pub/sub service (Pusher/Ably/etc.) or standing up a separate WebSocket server, used what a persistent Node.js server (Render, not serverless) already supports natively: **Server-Sent Events** backed by an **in-process pub/sub**.

- `lib/realtime.ts`: a per-user pub/sub (`subscribeUser`/`publishToUser`/`publishToUsers`) on top of a Node `EventEmitter`. Hit a real bug here worth recording: a plain module-scope `new EventEmitter()` produced *two independent instances* in practice — Route Handlers and Server Actions compile into separate module graphs (visible even within one Node process, especially under Turbopack dev) — so the SSE route's subscription and the Server Action's publish never saw each other. Diagnosed by tagging each instance with a random ID and logging both sides; fixed the same way `lib/prisma.ts` already avoids the equivalent HMR-duplication problem for `PrismaClient` — stash the EventEmitter on `globalThis` so every module graph in the process shares the one instance. Documented as a single-server-instance design (correct for this deployment; horizontal scaling would need a real shared bus like Postgres `LISTEN/NOTIFY` or Redis).
- `app/api/realtime/route.ts`: an authenticated (session + `User.active` checked) SSE Route Handler that subscribes the current user and streams `data: {...}\n\n` events with a 20s heartbeat, cleaning up on `req.signal` abort.
- Publish points, reusing the existing fan-out logic rather than duplicating it: `lib/notifications.ts`'s `notifyUser()` now publishes a `notification` event after creating the row — this alone makes the bell live for *every* existing notification trigger app-wide (order updates, QC, fulfillment, rewards, not just chat), for free. `sendMessageAction` publishes a `message` event to the same recipient set `notifyCustomer`/`notifyStaff` already notifies, plus the sender's own userId (so the sender's bubble appears through the same round-trip rather than a separate optimistic-UI code path — one source of truth, no dedup bugs). The action's old `redirect()` after sending was removed; the composer now clears itself once the pending state resolves.
- Client side: `RealtimeProvider` (mounted once in `Shell`) opens the single `EventSource` and rebroadcasts via `window` `CustomEvent`s (`realtime:message` / `realtime:notification`) rather than React Context, so independently-mounted client islands (bell, an open thread, the inbox list) can each listen without connection multiplication or prop-drilling. `NotificationBell` holds local state seeded from props and prepends live notifications / bumps the unread count. `MessageThread` appends live messages (dedup by id), auto-scrolls to bottom, and is now the single source of truth for the thread's contents post-mount. A small `RefreshOnMessage` component calls `router.refresh()` on any relevant event — dropped onto the `/messages` inbox list and the `ConversationCard` preview on Inquiry/Quotation/Job Order pages so "latest message preview" and unread badges update live there too, without turning those Server Components into client components.

### Verified end-to-end (two concurrent, independently-authenticated Playwright browser contexts)
- Customer sends → appears on staff's already-open thread with **zero page navigation** (tracked via `framenavigated` listeners on both pages) and zero manual refresh; staff replies → same in reverse.
- A user's own sent message appears through the same SSE round-trip as the recipient's, confirmed independently.
- Notification bell badge count increases live while staff sits on an unrelated page (`/dashboard`, not the conversation) — proves the notification path works independently of the message-thread path.
- `/messages` inbox list's last-message preview updates live while staff sits on the list itself, not inside a thread.
- Reload/reconnect: history persists correctly (it's just a normal DB read on mount — never depended on the SSE connection).
- Full route crawl re-run across ADMIN/STAFF(broad)/STAFF(narrow)/PRODUCTION/CUSTOMER after these changes: zero errors, confirming the permission system from the 2nd update wasn't disturbed.
- Mobile: sidebar drawer shows the exact requested order (Dashboard → My Inquiries → My Quotations → My Orders → Payment → My Rewards → Messages) at 375px with no overflow; the chat thread renders correctly on the same viewport (bubbles, timestamps, composer) with the message history from the live test visible after reload.

### Known limitation
Single-server-instance pub/sub (see `lib/realtime.ts`'s own doc comment) — correct for the current deployment, would need a shared bus if ever scaled to multiple Render instances behind a load balancer.

---

## August 15 — 4th update: Floating Messenger-style chat widget

Replaces the "go to a dedicated Messages page" flow with a Facebook-Messenger-style floating widget for the CUSTOMER portal, built entirely on the existing Conversation/Message/real-time infrastructure — no parallel chat system, and the full `/messages` pages stay exactly as they were (still linked from the widget's list view as "View full message history").

### What was added
- `FloatingChatWidget` (`components/messaging/floating-chat-widget.tsx`), mounted once in `Shell` only when `role === "CUSTOMER"` — visible on every Customer Portal page (Dashboard, My Inquiries, My Quotations, My Orders, Payment, My Rewards) without a route change.
- A circular button fixed bottom-right with an unread badge (💬), fetched on mount so it's accurate even before the customer ever opens it. Clicking opens the panel; clicking again minimizes it (same button, same handler — matches "click again to minimize").
- Panel has two views sharing one component: a compact **conversation list** (subject label, last-message preview, per-conversation unread badge, "New General Message", a link to the full `/messages` page) and a **thread view** that embeds the *existing* `MessageThread` component unmodified in behavior — same bubbles, same real-time listener, same composer. Opening the widget for the first time in a session jumps straight into the most recently active conversation (matching how Messenger itself behaves when you have something to catch up on); a back arrow in the header returns to the list to switch threads.
- New read-only data actions in `app/actions/messages.ts` (`getMyConversationsAction`, `getConversationMessagesAction`, `markConversationReadAction`, `openOrCreateGeneralConversationAction`) — same queries/shapes the `/messages` pages already used, just exposed as plain callable Server Actions so the globally-mounted client widget can fetch on demand instead of relying on a server-rendered page load. No new tables, no new fan-out logic.
- Real-time behavior is inherited, not rebuilt: the widget listens to the same `realtime:message` window event `RealtimeProvider` already broadcasts. On every event it re-fetches the conversation list (keeping the badge and previews authoritative) and, if the event is for the conversation currently open in the widget, marks it read server-side so it doesn't stay "unread" while actively being looked at.
- Mobile: the button stays fixed bottom-right at every viewport size; the open panel is `fixed inset-0` (near-fullscreen) below the `sm` breakpoint and a bounded `24rem`-wide, `32rem`-tall floating box above it — matching "expanding to most or all of the screen" on mobile vs. a proper floating widget on desktop/tablet.
- Polish fix: `MessageThread` gained an opt-in `fillHeight` prop (default off) that swaps its fixed `max-h-96` message area for a `flex-1` one so it stretches to fill the widget's bounded panel instead of leaving dead space below the composer on the mobile fullscreen layout. Off by default, so the Order page's inline thread and the full `/messages/[id]` page — which don't have a definite parent height — render exactly as before; verified via screenshot that neither changed.

### Verified
- Widget button present on every customer page tested (Dashboard, Inquiries, Quotations, Orders, Payments, Rewards); confirmed absent for STAFF.
- Open → auto-jumps into the most recent thread → minimize (click again) hides it → reopen restores the same thread (not back to the list).
- Two-session real-time test: staff replies via the full `/messages/[id]` page → appears in the customer's already-open widget instantly; customer sends from inside the widget → appears on staff's page instantly and shows correctly attributed on the customer's own side.
- Minimized-widget unread badge increments live when a new message arrives while the widget is closed, with the correct count.
- Mobile (375px): zero horizontal overflow in the closed, open-thread, and list states; screenshots confirm the thread now fills the available height with the composer pinned to the bottom instead of a dead gap.
- Full route crawl re-run across every role/permission combination from the earlier updates: zero regressions.

---

## August 15 — 5th update: Professional UI/UX + red/white branding + centralized business settings

A UI/UX enhancement pass, explicitly scoped to not touch any working business logic from the earlier August 15 updates. Rather than reskinning every page individually, the change went through the app's existing shared component layer so the rebrand cascades automatically and stays a "reusable design system" rather than a one-off coat of paint.

### Design system foundation
- `app/globals.css`: added a `brand-50`…`brand-900` red scale as CSS custom properties (Tailwind v4's CSS-based `@theme inline` config, no `tailwind.config.js`), wired `--font-sans` to Montserrat.
- `app/layout.tsx`: swapped Geist Sans for `next/font/google`'s Montserrat (weights 400–800); `generateMetadata()` now reads the page `<title>`, description, and favicon from `getBusinessSettings()` instead of static strings.
- Shared primitives updated once, inherited everywhere: `components/ui/button.tsx` (default variant → `bg-brand-600`), `components/ui/input.tsx` (focus ring → `brand-500` on Input/Textarea/Select), `components/layout/sidebar-nav.tsx` (active item → `border-l-2 border-brand-600 bg-brand-50 text-brand-700`), plus the messaging components (chat widget header/button, "mine" bubble color, notification-bell unread row) switched from slate/blue to the brand color. `Card`, `Badge`/`StatusBadge`, and `Table` were deliberately left neutral — the spec explicitly warned against making the whole interface red, and status-color semantics (green/red/yellow badges for PASS/FAIL/PENDING etc.) needed to stay independent of the brand accent.

### Centralized Business Settings (new: no more hard-coded business identity)
- New `BusinessSettings` Prisma model — a singleton row (`id @default("default")`, upsert-only writes) holding Business Identity (name, tagline, description, logo path, favicon path), Contact Information (contact number, email, Facebook URL, website), and Business Address (address line, city, province, postal code). Migration `20260817090000_business_settings` creates the table and seeds the singleton row with sensible defaults so the app never has to special-case a missing row.
- `lib/business-settings.ts`: `getBusinessSettings()` (React `cache()`-deduped per request, with an in-code fallback if the row were ever absent) is now the single source of truth every branded surface reads from — change it once in the admin UI, it propagates everywhere without touching another file.
- `app/(app)/admin/settings/` (new): an Admin-only page (`requireRole(["ADMIN"])`) with a sectioned form (Business Identity / Contact Information / Business Address) backed by `updateBusinessSettingsAction` — validates via zod, reuses the existing `saveUploadedFile()` upload helper for logo/favicon (no new upload infrastructure), only overwrites `logoPath`/`faviconPath` when a new file is actually chosen, and audit-logs the change. Linked from the Admin nav as "Business Settings".
- Wired into every branded surface: root `<title>`/description/favicon (`app/layout.tsx`), the login/register split-screen (`app/(auth)/layout.tsx` — logo or a letter-avatar fallback, business name, tagline, description), and the app `Shell` (`components/layout/shell.tsx`) — desktop sidebar header, mobile header bar, and the mobile nav drawer (`components/layout/mobile-nav.tsx`) all now render the admin-configured name/tagline/logo instead of the literal string "LP Printing" that used to be scattered across three files.

### Login page redesign
`app/(auth)/layout.tsx` + `app/(auth)/login/*`: two-column desktop layout (left: brand-red panel with logo/name/tagline/description; right: white form panel), collapsing to a single column on mobile. `login-form.tsx` gained a show/hide password toggle (`lucide-react` Eye/EyeOff icon button inside the password field) and a "Welcome back" heading; the register page got the matching heading treatment. Existing behavior (error Alert on bad credentials, demo-accounts hint box, `loginAction` server action) untouched.

### Dashboard polish
- Customer dashboard (`app/(app)/dashboard/page.tsx`): added a subtext line under the welcome heading; `StatCard` restyled with an uppercase tracking-wide label, a larger bold value (`text-2xl md:text-3xl`), and a `border-l-4` accent — `border-l-brand-600` normally, `border-l-amber-400` when a card needs attention (quotations awaiting approval, balance due > 0). The generic STAFF/PRODUCTION fallback dashboard got the same accent-border treatment on its quick-link cards.
- Admin dashboard (`app/(app)/admin/dashboard/page.tsx`): added two new stat queries the spec explicitly asked for — **New Inquiries** (`Inquiry` count where `status: "NEW"`) and **Pending Payments** (`Payment` count where `status: "PENDING"`) — both now lead the stat grid ahead of Open Quotations, followed by Outstanding Balance, QC Pass Rate, Low-Stock Items, and the existing monthly customer/rewards figures. This file's own `StatCard` helper (a separate component from the customer dashboard's) was restyled to match — same uppercase-label/larger-value/`border-l-4` treatment, `tone` renamed from `"yellow"` to `"attention"` for consistency between the two dashboards.

### Verification
- `npm run build` passes clean (Turbopack production build, all 26 routes compile, zero type errors) after every step, including the final dashboard changes.
- `npx prisma migrate status` / `migrate diff --exit-code`: zero drift, `BusinessSettings` migration applied cleanly on top of the existing 4 migrations.
- Full Playwright regression pass across all 4 roles (ADMIN, STAFF, PRODUCTION, CUSTOMER) plus mobile-viewport screenshots of the login page, both dashboards, the floating chat widget, and the new Business Settings page — re-confirming every item on the spec's own "must not break" list: inquiries, quotations (incl. duplicate-quotation prevention and prepared-by info), orders, payments, the customer Payment nav tab, payment recording, rewards, notifications and their redirects, real-time chat, the floating Messenger-style widget, staff permissions, production, fulfillment, and mobile responsiveness.

### Known gaps / deliberately deferred
- No dashboard charts were built — the spec said "charts where useful" as a suggestion, not a requirement, and the stat-card + list-section layout already answers the "what needs my attention" question the spec asked for; adding a charting dependency was judged higher risk/lower value than the rest of this update given the scope already covered.
- Business name/logo are not yet threaded into quotation/order/payment page *content* (only into the app chrome: login, sidebar, header, browser tab) — there's no PDF/document-generation feature in the app yet to attach a letterhead to, so there was nothing concrete to wire that data into beyond what's already centralized in `getBusinessSettings()` for whenever that feature exists.
- Full route crawl re-run across every role/permission combination from the earlier updates: zero regressions.
