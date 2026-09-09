# LP System — Inventory, Materials, Costing, Auto Quotation & Production Consumption
## Forensic Audit Report (Read-Only)

**Scope:** Inventory & Supplies, Material Consumption, Costing, Auto Quotation, Service/Product-material configuration, Production material usage, Waste/Reject/Allowance, related financial calculations.
**Method:** Direct code tracing (Prisma schema, Server Actions, `lib/` calculation modules, page components) — not filenames or UI labels. No code was modified, no data was changed, no migrations were run.
**Stack confirmed:** Next.js 16 App Router, Prisma 7.9.1 + PostgreSQL, Server Actions as the API layer, NextAuth v5 for auth/RBAC via `requireRole`/`requirePermission`.

---

## A. Executive Summary (plain language)

LP System's inventory and production-costing pieces are **real, transactionally sound, and individually well-built** — but they were built as **several independent subsystems that were never wired to each other**, and two of them (selling price, and "actual" job cost) quietly diverge from what their names imply.

In plain terms:

- **Inventory quantity** is trustworthy day-to-day (every change is transactional and audited), but the system keeps **three parallel counts of "how much stock exists"** (the item's own total, each purchase lot's remaining amount, and the movement ledger) with **no database rule forcing them to agree** — they're only kept in sync by every action remembering to update all three together.
- **A "recipe" (Bill of Materials) linking a Service to the materials it consumes does exist** — but it is **entirely optional, entirely disconnected from pricing**, and only affects two things: an internal cost-estimate display, and an "expected quantity" hint shown to production staff. It **never** reserves stock, **never** sets or validates what a customer is charged, and if a Service has no BOM configured, the system has **zero knowledge** of what materials it needs.
- **There is no "Auto Quotation" feature.** The closest thing — "Instant Quotation" — only fires for a narrow, opt-in case (a customer Inquiry, a Service flagged `instantQuoteEnabled`) and uses a price list, not material costs. The ordinary quotation a staff member builds is **100% manually-typed pricing**, with the price field never auto-filled from anything.
- **Waste and reject have no home.** There is no field anywhere that says "this much material was wasted" as distinct from "this much was legitimately used." Extra usage just becomes a bigger `actualQty` number with an optional free-text note — indistinguishable from normal consumption in every cost figure and every report.
- **"Profit" is not one number — it's at least four**, computed at different scopes (business-wide, per-service, per-job-order, per-order) with different revenue definitions (confirmed payments vs. quoted price) and different cost bases (actual-material-only vs. fully-estimated), that are **not guaranteed to agree with each other for the same order.**

None of this is sloppy code — the codebase's own comments are unusually candid about these exact limitations (e.g., explicitly disclaiming "a variance is not automatically waste," and showing `null` rather than a fabricated number when a cost can't be fully resolved). The gaps are architectural, not implementation bugs, and they are the correct starting point for the next phase.

### The four headline questions, answered directly

> **If I sell 100 pcs of a particular printed product, how does LP System currently know how much paper, ink, vinyl should be used?**

Only if an Admin has manually built a Bill of Materials for that specific Service (`Admin → Services → [service] → Costing → Material Components`). If they have, the system can compute `expected = 100 × consumptionPerUnit × (1 + wastePercent%)` per material — but this number is **never used to reserve or pre-deduct inventory**, **never used to set or check the quoted price**, and only ever surfaces as (a) an informational hint shown to production staff while they record what they actually used, and (b) an input to internal cost/margin reports. If the Service has no BOM configured — which nothing requires — the system has **no idea** how much material 100 pcs needs, and none of the pricing flow depends on it existing.

> **When production actually uses more or less material than expected, where does that difference go?**

It becomes a plain variance number (`actualQty − expectedQty`) visible in the Material Consumption report, explainable only by an optional free-text note the recording staff member may or may not write. There is no categorization step — the system does not ask "was this extra amount waste, a reprint, a customer change, or a data-entry mistake?" It's all folded into one `actualQty`, and that whole amount — however it arose — is what gets deducted from inventory and costed into the job.

> **When material is wasted, does the system actually remove it from inventory and include its cost in the job?**

**Only sometimes, and never both correctly at once.** If staff records the waste as extra `actualQty` on a normal production-consumption entry, it *is* removed from inventory and its cost *is* folded into the job's material cost — but completely indistinguishably from legitimate use. If staff instead uses the separate, generic Inventory "Record Movement" screen and picks "Waste" or "Reject" as the movement type, it *is* removed from inventory quantity — but that screen isn't linked to a Job Order for those movement types, so its cost is **never** included in any job's cost, any Profit & Loss figure, or any Service Profitability figure. There is no single path today that both removes wasted material from stock *and* correctly attributes its cost to the job that caused it, as a distinct, reportable line.

> **Where does the final profit number actually come from?**

There isn't one. Four different figures all call themselves some version of "profit," at different scopes, and they don't reconcile:

1. **Profit & Loss (business-wide, date range):** confirmed-payment revenue minus a per-order cost that's actual *only if every job order on that order is fully costed*, otherwise a BOM/flat estimate — minus flat Operating Expenses.
2. **Service Profitability (per service):** the *same* actual/estimate cost logic, but revenue here is the *quoted* price, not confirmed payments — a different revenue basis than #1, even though both pages otherwise look like they should agree.
3. **Job Order Cost Summary (per job order):** quoted price for that one service minus actual material cost + *estimated* labor/machine/finishing/other — real material actuals, but everything else is still a standing rate guess, and Operating Expenses never enter this figure at all.
4. **Order Costing panel (per order, on the Order detail page):** order revenue minus a cost *snapshot* taken once at order-creation time (or a live re-estimate) — a fourth, entirely separate calculation that a user could easily mistake for #3.

None of these are wrong, exactly — each is internally consistent and the code is honest about what it is (showing `null` rather than a guessed number when data is missing). But there is no single authoritative "this order made ₱X profit" figure anywhere in the system today.

---

## B. Current Architecture

```
Service ──┬── pricingMethod / basePrice / pricingTiers / promotions ──► SELLING PRICE ENGINE (lib/pricing.ts)
          │                                                                   │
          │                                                                   ▼
          │                                                       Quotation line unitPrice
          │                                                       (ALWAYS manually typed —
          │                                                        never auto-filled from
          │                                                        anything below)
          │
          └── ServiceBOMMaterial[] (recipe) ─┐
              ServiceCostComponent[] (labor/  ├──► COST ESTIMATE ENGINE (lib/service-costing.ts)
              machine/finishing/other)        │            │
                                               │            ▼
                                               │    Internal margin display only
                                               │    (Costing page, Quotation detail's
                                               │     cost column, Order's cost snapshot)
                                               │
InventoryItem ◄── SupplyLot (purchase, own unitCost)
     │
     ├── currentQty (stored, directly mutated) ◄── recordPurchaseAction / recordMovementAction /
     │                                              recordConsumptionAction / reverseConsumptionAction
     │
     └── computeItemCostBasis() = moving average cost across non-cancelled lots
                     │
                     ▼
        JobOrderMaterialConsumption
        (expectedQty snapshot from BOM, actualQty as entered,
         cost snapshot from moving average AT THAT MOMENT)
                     │
                     ▼
        computeJobOrderCostSummary() — actual material + estimated everything else
                     │
              ┌──────┴──────┐
              ▼             ▼
     Profit & Loss    Service Profitability   (two separate reports, two
     (confirmed-       (quoted-price revenue)   different revenue bases,
      payment revenue)                           both falling back to the
                                                  same cost-estimate engine
                                                  when actuals aren't available)
```

The two halves — **pricing** (top) and **costing/inventory** (bottom) — are built to a high standard individually, but the only connections between them are three narrow, one-directional, read-only bridges: a margin *display* on the Costing page, a cost *display* on the Quotation detail page, and a one-time cost *snapshot* taken when an Order is created. None of them write back into pricing, inventory, or each other.

---

## C. Current Data Model — Key Tables

| Model | Purpose | Key fields | Notable relations | Created/updated by | Deletes? |
|---|---|---|---|---|---|
| `InventoryItem` | The material/supply master record | `sku`, `name`, `unit`, `reorderThreshold`, `currentQty` (stored, mutated directly) | `SupplyLot[]`, `ServiceBOMMaterial[]` (bomUsages), `JobOrderMaterialConsumption[]` | `createInventoryItemAction` (role-gated only, not permission-gated) | No delete action exists |
| `Supplier` | Vendor for purchases | `name`, contact fields, `active` | `SupplyLot[]` | `createSupplierAction`/`updateSupplierAction` (`SUPPLIER_MANAGE`) | Never deleted — deactivated via `active` toggle only |
| `SupplyLot` | One purchase/receiving event — this app's actual "purchase" record | `receivedQty`, `remainingQty`, `unitCost` (nullable, per-lot), `cancelledAt` | belongs to `InventoryItem`, optional `Supplier`; has `InventoryMovement[]` | `recordPurchaseAction` (`PURCHASE_MANAGE`) | Never deleted — `cancelledAt` flags a reversed purchase (only if nothing consumed from it yet) |
| `InventoryMovement` | Append-only quantity ledger | `type` (`RECEIVE/ALLOCATE/CONSUME/REJECT/WASTE/ADJUST/CANCEL/CONSUME_REVERSAL`), `qty`, optional `jobOrderId`, optional `consumptionRecordId` | belongs to a `SupplyLot`; optionally links a `JobOrderMaterialConsumption` | multiple actions | Never deleted — reversals are new compensating rows |
| `ServiceBOMMaterial` | The material "recipe" line for a Service | `consumptionPerUnit`, `wastePercent` (planned allowance, not actual) | `Service` ↔ `InventoryItem` | `addBOMMaterialAction`/`updateBOMMaterialAction`/`removeBOMMaterialAction` (`SERVICE_MANAGE`) | Hard-deleted on remove (no history kept for a removed BOM line itself) |
| `ServiceCostComponent` | Non-material cost line (labor/machine/finishing/other) | `category`, `basis` (PER_UNIT/PER_HOUR/FLAT), `rate`, `estimatedHours` | `Service` | same as above | Hard-deleted on remove |
| `JobOrderMaterialConsumption` | The cost-bearing record of actual material use | `expectedQty` (nullable snapshot), `actualQty` (required), `unitCostSnapshot`/`totalCostSnapshot`, `varianceReason` (free text), `reversedAt`/`reversedById` | `JobOrder` ↔ `InventoryItem`; has `InventoryMovement[]` | `recordConsumptionAction`/`reverseConsumptionAction` (`PRODUCTION_UPDATE_STAGE`, PRODUCTION role bypasses) | Never deleted — reversal flags, doesn't delete |
| `Service` | The sellable product/service | `pricingMethod`, `basePrice`, `pricingTiers`, `promotions` (pricing); separately `productionCost` (flat cost fallback), `targetMarginPct` (advisory only) | `ServiceBOMMaterial[]`, `ServiceCostComponent[]`, `QuotationLineItem[]`, `OrderLineItem[]`, `JobOrder[]` | various | Can be hard-deleted (`deleteServiceAction`) — quotations/orders/job orders keep their own name snapshot, unaffected |
| `Quotation` / `QuotationLineItem` | Customer-facing price offer | `unitPrice` on the line (always manual) | `Order` (0 or 1), `Service` | `createQuotationAction`/`editQuotationAction` | Line items hard-deleted/replaced on edit; Quotation itself soft-cancelled |
| `Order` / `OrderLineItem` | The committed transaction | pricing breakdown fields (`subtotal`, `discountAmount`, `taxAmount`, `totalAmount`), `estimatedProductionCostSnapshot`, `costSnapshotFullyConfigured` | `Quotation` (optional), `JobOrder[]`, `Payment[]` | `createOrderAction` | — |
| `JobOrder` | One service's production unit within an Order | `status` (`ON_HOLD→IN_PROGRESS→QC→REWORK→READY→RELEASED→COMPLETED`), `quantity` | `Order`, `Service`, `WorkflowTemplate`, `JobOrderStageLog[]`, `JobOrderMaterialConsumption[]`, `QCResult[]`, `ReworkRecord[]` | production actions | — |
| `QCResult` / `ReworkRecord` | **Output** quality tracking — NOT material waste | `quantityFailed`, `defectNotes` / `defectDescription`, `quantityAffected` | `JobOrder` | production/QC actions | — |
| `OperatingExpense` / `ExpenseCategory` | Business overhead, deliberately separate from production cost | `amount`, `expenseDate`, `voidedAt` | `ExpenseCategory` | expense actions | Voided, not deleted |

**Orphaned/suspicious relationships found:** none structurally broken. The one notable oddity is that `ServiceBOMMaterial`/`ServiceCostComponent` rows are **hard-deleted** when removed from a Service's BOM (no soft-delete/history), while almost everything else in this schema (purchases, movements, consumption, suppliers) is scrupulously soft-deleted/flagged for history. This is a real inconsistency in the "never destroy history" pattern the rest of the schema follows — see Bug/Issue list below.

---

## D. Current Calculations (verbatim, traced)

**Cost basis for any material** (`lib/inventory-cost.ts`, `computeItemCostBasis`):
```
averageUnitCost = Σ(lot.unitCost × lot.receivedQty) / Σ(lot.receivedQty)
                  across all non-cancelled SupplyLots with a configured unitCost
```
Explicitly a **purchase-weighted moving average**, weighted by each lot's *originally received* quantity (not its remaining quantity) — not FIFO, not LIFO, not last-cost, not standard cost.

**Expected material for a Job Order** (`lib/production-cost.ts`, `computeExpectedConsumption`):
```
expectedQty = jobOrder.quantity × ServiceBOMMaterial.consumptionPerUnit × (1 + wastePercent / 100)
```
Computed live from the Service's current BOM every time — never persisted onto the Job Order itself. Returns nothing if the Service has no BOM rows.

**Service cost estimate** (`lib/service-costing.ts`, `computeServiceCostBreakdown`):
- If the Service has **zero** BOM material rows and **zero** cost-component rows → `Service.productionCost × qty` (flat fallback).
- Otherwise → `Σ(material actualQty × averageUnitCost) + Σ(cost component amount)`, where each material's `actualQty = qty × consumptionPerUnit × (1 + wastePercent/100)`, and cost components resolve as `rate × qty` (PER_UNIT), `rate × estimatedHours × qty` (PER_HOUR), or a flat `rate` (FLAT).
- If any line can't be resolved (e.g. a PER_HOUR component missing `estimatedHours`), the **whole total is `null`**, not an understated partial sum.

**Selling price / quote** (`lib/pricing.ts`) — entirely separate inputs: `Service.basePrice`, `pricingMethod` (PER_PIECE/FIXED/PER_SET/PER_AREA), `minQuantity`, `Pricelist` quantity tiers, `Promotion` rows. **Never references BOM or cost components.**

**Quotation/Order totals** (`lib/pricing-totals.ts`, `computeTotals`) — the one genuinely shared formula:
```
subtotal        = Σ(line qty × line unitPrice)
discountAmount  = percentage: subtotal × discountValue/100 (capped 0–100%)
                  fixed:      min(discountValue, subtotal)
taxable         = max(0, subtotal − discountAmount)
taxAmount       = taxable × taxPct/100 (capped 0–100%)
total           = taxable + taxAmount
```
Confirmed reused identically by Quotation create/edit and Order create (manual/historical branches); an Order created *from* a Quotation copies that Quotation's already-computed breakdown verbatim instead of recomputing.

**Job Order actual cost** (`lib/production-cost.ts`, `computeJobOrderCostSummary`):
```
actualMaterialCost      = Σ(JobOrderMaterialConsumption.totalCostSnapshot)  [only if every consumption is costed]
estimatedNonMaterialCost = Σ(ServiceCostComponent amounts, same formula as above)
actualProductionCost    = actualMaterialCost + estimatedNonMaterialCost
actualGrossProfit       = (quotation line's unitPrice × jobOrder.quantity) − actualProductionCost
```
Material is real; labor/machine/finishing/other are **always** the standing rate estimate — there is no actual time-tracking or metering anywhere in this codebase.

**Profit & Loss** (`lib/financial-summary.ts`, `computeFinancialFoundation`):
```
revenue  = Σ(CONFIRMED Payment.amount within the date range)
cost     = Σ over each order with a confirmed payment in range:
             if ALL its job orders are fully costed → Σ(computeJobOrderCostSummary.actualProductionCost)
             else → estimateCostForLines(quotation line items) [BOM/flat estimate]
grossProfit = revenue − cost         (null unless every contributing order's cost resolved)
netProfit   = grossProfit − Σ(OperatingExpense.amount within range, not voided)
```

**Service Profitability** (`lib/profitability-reports.ts`, `computeServiceProfitability`): same actual-preferred/estimate-fallback cost logic as above, **but revenue = quotation line `unitPrice × qty`** (the quoted price), not confirmed-payment revenue — a genuinely different revenue definition from the P&L page above, despite both restricting to "orders with a confirmed payment in range."

---

## E. Current Workflow: Material → Quotation → Order → Production → Consumption

```
1. MATERIAL DEFINED
   InventoryItem created. Optionally, an Admin later builds a BOM for a
   Service by adding ServiceBOMMaterial rows referencing it. This step is
   entirely optional — nothing else in the system requires it.

2. QUOTATION
   Staff picks a Service (search only returns id/name/category — no price
   data). unitPrice is 100% manually typed. Neither the BOM nor
   Service.basePrice auto-fills or validates it. Material is neither
   reserved nor deducted — purely informational at best (an internal
   "estimated cost" column is shown to staff with COST_VIEW permission,
   computed from the BOM if one exists, else the flat productionCost).

3. ORDER
   If created FROM an approved Quotation: pricing breakdown copied
   verbatim (not recomputed); a one-time cost SNAPSHOT is taken via
   estimateCostForLines() and stored on the Order for later reporting.
   If created manually (no source quotation) or as a historical/backdated
   entry: computeTotals() runs fresh against the submitted line items.
   Material is still neither reserved nor deducted at this stage.

4. JOB ORDER / PRODUCTION
   A Job Order is created per Service within the Order, entering a
   workflow (ON_HOLD → IN_PROGRESS → QC → REWORK → READY → RELEASED →
   COMPLETED). At ANY point in this lifecycle — not gated to a specific
   stage — production staff can open "Record Consumption" if the Service
   has a BOM, see the live-computed expectedQty as a hint, and type in
   actualQty. This is the FIRST point materials are actually deducted
   from inventory.

5. CONSUMPTION
   recordConsumptionAction runs atomically: creates the
   JobOrderMaterialConsumption row (snapshotting expectedQty and the
   moving-average unitCost/totalCost at that instant), depletes
   SupplyLots oldest-received-first, writes InventoryMovement rows,
   decrements InventoryItem.currentQty. Reversible in full (not partial)
   via reverseConsumptionAction, which restores everything and flags
   (never deletes) the original record.

6. COMPLETION / RECONCILIATION
   There is no explicit "reconcile expected vs actual" step or closing
   action. The variance simply exists as a queryable number
   (actualQty − expectedQty) in the Material Consumption report, with an
   optional free-text varianceReason. Nothing forces or prompts
   reconciliation; nothing categorizes the variance as waste, reject, or
   legitimate extra use.
```

---

## F. Problems Found (categorized)

| # | Issue | Category | Severity |
|---|---|---|---|
| 1 | `InventoryItem.currentQty`, `Σ SupplyLot.remainingQty`, and the `InventoryMovement` ledger are three independent representations of "how much stock exists," with no database constraint enforcing agreement — only transactional discipline in each action. The code itself acknowledges drift is possible (a documented "fallback lot" path in `recordConsumptionAction` exists specifically to keep the movement ledger honest when lot totals don't cover a deduction). | Architecture / Data | **High** |
| 2 | Selling price (`Service.basePrice`/pricing engine) and cost estimation (BOM/`ServiceCostComponent`) are completely disconnected. A Service can have a fully-built, expensive BOM and still be quoted at any arbitrary manual price with no warning, and vice versa. | Architecture / Calculation | **High** |
| 3 | No distinct waste/reject/spoilage concept exists on `JobOrderMaterialConsumption` — only a free-text `varianceReason`. The `MovementType.WASTE`/`REJECT` enum values exist but are only reachable via a disconnected generic Inventory screen that typically isn't linked to a Job Order, so that cost never reaches any job-costing or P&L figure. | Missing Capability / Calculation | **High** |
| 4 | Four different "profit" calculations exist (P&L, Service Profitability, Job Order Cost Summary, Order Costing panel) with different revenue bases and different cost-resolution rules, none guaranteed to reconcile with each other for the same order. | Calculation / Architecture | **High** |
| 5 | `createInventoryItemAction` and `recordMovementAction` (the generic manual movement screen, including `ADJUST`) are gated only by coarse `requireRole(["STAFF","ADMIN","PRODUCTION"])`, unlike `PURCHASE_MANAGE`/`SUPPLIER_MANAGE`/`PRODUCTION_UPDATE_STAGE` used elsewhere — any Staff account can adjust inventory regardless of granted permissions. | Data / Security-adjacent | **Medium** |
| 6 | Material consumption recording is not gated to any Job Order stage/status — it can be recorded at `ON_HOLD` just as easily as `COMPLETED`, with no workflow guard. | Architecture / UX | **Medium** |
| 7 | `ServiceBOMMaterial`/`ServiceCostComponent` rows are hard-deleted on removal, unlike almost every other model in this schema (purchases, movements, consumption, suppliers), which are all soft-deleted/flagged. A removed BOM line leaves no trace of what a historical cost estimate was actually based on. | Data / Historical Safety | **Medium** |
| 8 | Service Profitability's "sales" figure (quoted price) and Profit & Loss's "revenue" figure (confirmed payments) use different definitions of revenue for what a user would reasonably assume is the same underlying number. | Calculation | **Medium** |
| 9 | No accumulated/aggregated waste reporting exists by material, service, date, or staff — despite `MovementType.WASTE`/`REJECT` existing as valid values, nothing rolls them up anywhere. | Missing Capability | **Medium** |
| 10 | No business-division (Let's Print vs. King Custom) field exists anywhere on `Service`, `InventoryItem`, `Supplier`, or any costing model — `Service.category` is free text and unenforced. | Missing Capability / Data | **Medium** |
| 11 | The Costing module (BOM builder, cost components, margin simulator) requires navigating to a dedicated sub-page per Service with no visible connection back to that Service's actual quoted price anywhere in its own UI beyond a disclaimer sentence — easy for a non-technical user to believe editing it changes something it doesn't. | UX | **Low** |
| 12 | `Supplier`'s schema doc comment references a `deactivateSupplierAction` function by name; no such function exists — deactivation is actually a side effect of the generic `updateSupplierAction`'s status toggle. Harmless, but a stale comment that could mislead future maintenance. | Documentation drift | **Low** |

---

## G. Duplication

- **Not duplicated (genuine reuse):** Confirmed-payment-per-order logic (`paymentSummary`/`confirmedPaymentTotal` in `lib/workflow.ts`) is reused across 9+ call sites — Order detail, payments actions, production actions, quotation detail, order search, public tracking, invoices. One minor exception: the customer-facing Payments list page recomputes the same "sum of CONFIRMED payments" logic inline rather than calling the shared helper — functionally identical, not a call to the shared function.
- **Not duplicated (genuine reuse):** `computeServiceCostBreakdown` is the single cost-estimate engine, reused by `estimateCostForLines` and `computeJobOrderCostSummary`, which are in turn both called directly by Profit & Loss and Service Profitability rather than either reimplementing cost math.
- **Necessary, non-accidental re-implementation:** Aggregate/range reports (Transaction Summary, P&L, Service Profitability, Payments list) each run their own `prisma.payment.aggregate`/`groupBy` query rather than looping the single-order helper — unavoidable since the helper only handles one order at a time — but every one of these queries uses the identical "CONFIRMED status" filter semantics, and the code comments explicitly call out this consistency as deliberate.
- **Real duplication/divergence to flag:** "Revenue" itself is defined two different ways across reports that otherwise look comparable (confirmed payments in P&L vs. quoted price in Service Profitability) — this is the one place where superficially-similar figures are actually computed on different bases, and it's the kind of thing that produces "the reports don't match" support tickets.
- **Data duplication:** None found between Inventory/Material and Service/BOM — `ServiceBOMMaterial` correctly references the single `InventoryItem` table rather than maintaining its own parallel material list. This is a genuine strength of the current design.

---

## H. Missing Capabilities

- **Expected vs. actual consumption:** Exists, but only as a live-computed hint at the moment of recording, snapshotted onto the consumption record — never used for reservation, never enforced, never required to reconcile.
- **Waste/reject/spoilage:** Does not exist as a first-class, job-attributable concept. The closest things (`MovementType.WASTE`/`REJECT`, `varianceReason` free text) are either disconnected from Job Orders or purely descriptive with no financial consequence.
- **Production allowance:** Exists at the estimate stage only (`wastePercent` on the BOM line, baked into `expectedQty`) — there is no concept of an *actual* allowance consumed/remaining.
- **Accumulated waste:** No aggregation by material, service, order, date, or staff exists anywhere.
- **Job costing:** Exists in a partial, material-only-actual form, scoped per Job Order, not reconciled with the separate Order-level cost snapshot, and never including Operating Expenses.
- **Inventory cost impact of waste:** Waste recorded via the generic Inventory screen decrements quantity correctly but has no cost/job attribution at all; waste folded into a normal consumption's `actualQty` has cost attribution but no waste categorization. Neither path achieves both correctly.
- **Business division filtering:** Does not exist on any inventory/service/costing model.

---

## I. Recommended Simplified Architecture (conceptual only — not implemented)

```
SERVICE ──► MATERIAL RECIPE (ServiceBOMMaterial — already exists, keep)
              │
              ▼
        STANDARD CONSUMPTION + WASTE ALLOWANCE (already exists — keep,
              but add: this recipe should also inform, not dictate,
              the price the pricing engine suggests)
              │
              ▼
        COST ESTIMATE (computeServiceCostBreakdown — already exists, keep
              as the single costing engine; stop treating pricing as
              unrelated to it — at minimum, surface the estimate INSIDE
              the quotation line-item entry flow as a visible reference
              figure, without forcing it)
              │
              ▼
        QUOTATION (keep manual override always available — this
              business needs negotiable pricing — but the cost estimate
              should be visible at the point of typing a price, not
              three clicks away on a different page)
              │
              ▼
        ORDER (keep the existing verbatim-copy-from-quotation behavior —
              it is correct and intentional)
              │
              ▼
        EXPECTED MATERIAL (computeExpectedConsumption — already exists,
              keep; consider persisting it onto the Job Order at creation
              time rather than only computing it live, so a later BOM
              edit can't silently change what an in-flight job's
              "expected" figure means)
              │
              ▼
        PRODUCTION → ACTUAL CONSUMPTION (recordConsumptionAction —
              already exists, keep the transactional/reversible design;
              it is the most solid part of this system)
              │
              ▼
        WASTE / REJECT / ALLOWANCE (NEW — the one genuinely missing
              piece: add an explicit categorization to consumption
              variance, e.g. a `varianceType` enum — NORMAL / WASTE /
              REJECT / DAMAGED / REPRINT — rather than only free text,
              so it becomes queryable and reportable without inventing a
              second consumption model)
              │
              ▼
        INVENTORY ADJUSTMENT (already happens automatically as part of
              consumption — keep)
              │
              ▼
        ACTUAL JOB COST (computeJobOrderCostSummary — already exists;
              consolidate with the Order-level cost-snapshot panel so
              there is ONE per-order actual-cost figure, not two)
              │
              ▼
        REVENUE → PROFIT (pick ONE revenue definition — confirmed
              payments is the more defensible one, since it's cash-real —
              and have Service Profitability adopt it too, rather than
              maintaining a second "quoted price" revenue basis)
```

**What should be reused as-is (strong, working foundations):** `SupplyLot`/`InventoryMovement`'s transactional purchase/consumption/reversal machinery; `computeItemCostBasis`'s moving-average costing; `computeServiceCostBreakdown`'s BOM-aware estimate engine; `computeTotals`'s shared pricing-total formula; `paymentSummary`/`confirmedPaymentTotal` as the one payment source of truth; the audit-log discipline already present on every mutating action.

**What should eventually be consolidated:** the Order-level cost snapshot panel and the Job-Order-level cost summary (two separate "actual cost" figures today); the two different revenue definitions used by P&L vs. Service Profitability; the disconnected generic Inventory Waste/Reject movement type vs. Job-Order consumption variance (one waste concept, not two).

**What should NOT change:** the Production stage workflow itself (`lib/workflow.ts`, `JobOrderStageLog`), the purchase/receiving flow, the reversal/audit patterns already in place, and the deliberate manual-override-always-available nature of quotation pricing (this is a negotiated-pricing business, not a fixed-catalog one — the audit found no evidence this was accidental).

---

## J. Migration Risk

- **Adding a `varianceType` categorization to `JobOrderMaterialConsumption`:** Low risk — purely additive, nullable, doesn't touch existing rows' meaning. Historical consumption records without it simply show "uncategorized."
- **Unifying the two "actual cost" panels (Order-level snapshot vs. Job-Order summary):** Medium risk — `Order.estimatedProductionCostSnapshot`/`costSnapshotFullyConfigured` are already persisted, historical values; any consolidation must preserve reading old snapshots exactly as they were computed, not retroactively recompute them with new logic (which would silently change historical financial reports).
- **Reconciling the two revenue definitions (P&L vs. Service Profitability):** Medium risk purely from a stakeholder-communication angle — whichever direction is chosen will change a number people may already be using for business decisions. Not a technical risk (both queries are simple aggregates), but requires explicit sign-off on which definition becomes canonical.
- **Making BOM/costing inform pricing:** Higher risk if done as automatic enforcement (would break the negotiated-pricing model this business clearly relies on). Low risk if done as a visible reference figure alongside the still-manual price field.
- **Hard-deleted BOM/cost-component history:** Changing this to soft-delete is additive/safe going forward, but cannot retroactively recover already-deleted history.
- **Anything touching `InventoryItem.currentQty` reconciliation logic:** Highest risk in this entire audit. Any attempt to "fix" the three-parallel-counts issue must be done via a read-only reconciliation report *first* (to see how much real-world drift, if any, already exists) before any schema or logic change — changing the authoritative source of quantity truth on a live system with existing stock is exactly the kind of change that can silently corrupt inventory data if sequenced wrong.

---

## K. Recommended Implementation Phases

```
Phase 1 — Reconciliation & observability (no behavior change)
  Read-only report comparing InventoryItem.currentQty against the sum of
  its SupplyLot.remainingQty and the net of its InventoryMovement ledger,
  to quantify whether drift actually exists today before touching anything.

Phase 2 — Waste/Reject categorization (additive schema only)
  Add a nullable `varianceType` (or similar) enum to
  JobOrderMaterialConsumption. No change to existing recording flow
  required beyond exposing the new field; existing rows stay NULL/
  "uncategorized."

Phase 3 — Accumulated waste reporting
  A new report (or an extension of the existing Material Consumption
  report) aggregating the new categorization by material/service/date/
  staff — purely additive, reads existing + new fields.

Phase 4 — Consolidate the two "actual job cost" figures
  Decide whether the Order-level snapshot or the Job-Order-level summary
  becomes canonical; preserve historical snapshot values exactly as
  stored rather than recomputing them.

Phase 5 — Reconcile revenue definitions across P&L and Service
Profitability
  Business decision first (confirmed-payment vs. quoted-price revenue),
  then a single shared revenue query used by both.

Phase 6 — Surface cost estimates alongside quotation pricing
  Show the existing computeServiceCostBreakdown figure as a visible
  reference at the point of typing a quotation line's unit price —
  informational only, never enforced, preserving negotiated pricing.

Phase 7 — Business division tagging (if still wanted)
  Add a division/brand field to Service and InventoryItem; this is
  independent of everything above and can happen at any point without
  touching costing/pricing logic at all.

Phase 8 — Permission-consistency cleanup
  Bring createInventoryItemAction/recordMovementAction onto the same
  fine-grained requirePermission pattern already used by purchasing and
  production consumption.
```

This sequence deliberately puts the **zero-risk observability work first**, the **additive schema changes second**, and defers anything that touches an existing authoritative number (job cost, revenue definition) until after real drift/impact is measured — consistent with the audit's own finding that the biggest risks in this codebase are architectural gaps between well-built pieces, not broken pieces themselves.

---

*This report is the product of a read-only forensic audit. No source code, database schema, or data was modified in the course of producing it.*
