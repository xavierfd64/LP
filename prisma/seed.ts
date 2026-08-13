import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function hash(pw: string) {
  return bcrypt.hash(pw, 10);
}

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

async function writeSampleFile(name: string, content: string) {
  await mkdir(UPLOAD_DIR, { recursive: true });
  const fname = `seed-${Date.now()}-${name}`;
  await writeFile(path.join(UPLOAD_DIR, fname), content);
  return `/uploads/${fname}`;
}

async function main() {
  console.log("Seeding database...");

  // ---------- Users ----------
  const admin = await prisma.user.create({
    data: {
      name: "Alex Admin",
      email: "admin@lp.test",
      passwordHash: await hash("password123"),
      role: "ADMIN",
      phone: "0917-000-0001",
    },
  });

  const staff1 = await prisma.user.create({
    data: {
      name: "Sandra Staff",
      email: "staff1@lp.test",
      passwordHash: await hash("password123"),
      role: "STAFF",
      phone: "0917-000-0002",
    },
  });
  const staff2 = await prisma.user.create({
    data: {
      name: "Steve Staff",
      email: "staff2@lp.test",
      passwordHash: await hash("password123"),
      role: "STAFF",
      phone: "0917-000-0003",
    },
  });

  const prod1 = await prisma.user.create({
    data: {
      name: "Pedro Production",
      email: "prod1@lp.test",
      passwordHash: await hash("password123"),
      role: "PRODUCTION",
      phone: "0917-000-0004",
    },
  });
  const prod2 = await prisma.user.create({
    data: {
      name: "Paula Production",
      email: "prod2@lp.test",
      passwordHash: await hash("password123"),
      role: "PRODUCTION",
      phone: "0917-000-0005",
    },
  });

  const custUser1 = await prisma.user.create({
    data: {
      name: "Juan Dela Cruz",
      email: "juan@lp.test",
      passwordHash: await hash("password123"),
      role: "CUSTOMER",
      phone: "0917-100-0001",
    },
  });
  const custUser2 = await prisma.user.create({
    data: {
      name: "Maria Santos",
      email: "maria@lp.test",
      passwordHash: await hash("password123"),
      role: "CUSTOMER",
      phone: "0917-100-0002",
    },
  });
  const custUser3 = await prisma.user.create({
    data: {
      name: "Ramon Bautista",
      email: "ramon@lp.test",
      passwordHash: await hash("password123"),
      role: "CUSTOMER",
      phone: "0917-100-0003",
    },
  });

  const customer1 = await prisma.customer.create({
    data: { userId: custUser1.id, name: custUser1.name },
  });
  const customer2 = await prisma.customer.create({
    data: { userId: custUser2.id, name: custUser2.name, companyName: "Santos Sportswear" },
  });
  const customer3 = await prisma.customer.create({
    data: {
      userId: custUser3.id,
      name: custUser3.name,
      companyName: "Bautista Municipal Government",
      isQualifiedForTerms: true,
    },
  });

  // ---------- Workflow Templates ----------
  const jerseyTemplate = await prisma.workflowTemplate.create({
    data: {
      name: "Jersey",
      stages: {
        create: [
          { name: "Design", order: 1 },
          { name: "Printing", order: 2 },
          { name: "Pressing", order: 3 },
          { name: "Sewing", order: 4 },
          { name: "QC", order: 5, isQCStage: true },
          { name: "Sorting", order: 6 },
          { name: "Packing", order: 7 },
        ],
      },
    },
  });

  const tarpTemplate = await prisma.workflowTemplate.create({
    data: {
      name: "Tarp",
      stages: {
        create: [
          { name: "Design", order: 1 },
          { name: "Printing", order: 2 },
          { name: "Cutting & Finishing", order: 3 },
          { name: "QC", order: 4, isQCStage: true },
          { name: "Packing", order: 5 },
        ],
      },
    },
  });

  const dtfTemplate = await prisma.workflowTemplate.create({
    data: {
      name: "DTF Shirt",
      stages: {
        create: [
          { name: "Design", order: 1 },
          { name: "DTF Printing", order: 2 },
          { name: "Pressing", order: 3 },
          { name: "QC", order: 4, isQCStage: true },
          { name: "Packing", order: 5 },
        ],
      },
    },
  });

  const signageTemplate = await prisma.workflowTemplate.create({
    data: {
      name: "Signage",
      stages: {
        create: [
          { name: "Design", order: 1 },
          { name: "Fabrication", order: 2 },
          { name: "Printing & Mounting", order: 3 },
          { name: "QC", order: 4, isQCStage: true },
          { name: "Installation", order: 5, isInstallStage: true },
        ],
      },
    },
  });

  // ---------- Inventory ----------
  const vinylItem = await prisma.inventoryItem.create({
    data: { sku: "TARP-VINYL-13OZ", name: "Tarpaulin Vinyl 13oz", unit: "meter", reorderThreshold: 100, currentQty: 40 },
  });
  const jerseyFabric = await prisma.inventoryItem.create({
    data: { sku: "JERSEY-DRIFIT", name: "Dri-Fit Jersey Fabric", unit: "yard", reorderThreshold: 50, currentQty: 200 },
  });
  const dtfFilm = await prisma.inventoryItem.create({
    data: { sku: "DTF-FILM", name: "DTF Transfer Film", unit: "roll", reorderThreshold: 5, currentQty: 10 },
  });
  const sintraBoard = await prisma.inventoryItem.create({
    data: { sku: "SINTRA-3MM", name: "Sintra Board 3mm", unit: "sheet", reorderThreshold: 10, currentQty: 25 },
  });

  await prisma.supplyLot.create({
    data: {
      inventoryItemId: vinylItem.id,
      lotCode: "TAR-202607-001",
      receivedQty: 100,
      remainingQty: 40,
      supplier: "ABC Materials Corp",
      receivedDate: new Date("2026-07-05"),
    },
  });
  await prisma.supplyLot.create({
    data: {
      inventoryItemId: jerseyFabric.id,
      lotCode: "JER-202608-001",
      receivedQty: 200,
      remainingQty: 200,
      supplier: "Textile Hub PH",
      receivedDate: new Date("2026-08-01"),
    },
  });
  await prisma.supplyLot.create({
    data: {
      inventoryItemId: dtfFilm.id,
      lotCode: "DTF-202608-001",
      receivedQty: 12,
      remainingQty: 10,
      supplier: "PrintSupply Co",
      receivedDate: new Date("2026-08-03"),
    },
  });
  await prisma.supplyLot.create({
    data: {
      inventoryItemId: sintraBoard.id,
      lotCode: "SIN-202608-001",
      receivedQty: 25,
      remainingQty: 25,
      supplier: "BoardWorks",
      receivedDate: new Date("2026-08-08"),
    },
  });

  // ---------- Inquiries ----------
  const inquiry1 = await prisma.inquiry.create({
    data: {
      customerId: customer1.id,
      description: "Need 25 sublimation basketball jerseys for our barangay league.",
      desiredProduct: "Jersey",
      roughQty: 25,
      status: "QUOTED",
    },
  });
  const inquiry2 = await prisma.inquiry.create({
    data: {
      customerId: customer2.id,
      description: "50 DTF printed shirts for a company outing.",
      desiredProduct: "DTF Shirt",
      roughQty: 50,
      status: "QUOTED",
    },
  });
  const inquiry3 = await prisma.inquiry.create({
    data: {
      customerId: customer3.id,
      description: "Tarpaulin streamers + signage for municipal fiesta, includes installation.",
      desiredProduct: "Signage",
      roughQty: 10,
      status: "QUOTED",
    },
  });
  await prisma.inquiry.create({
    data: {
      customerId: customer1.id,
      description: "Lanyards with custom print for a seminar, around 100 pcs.",
      desiredProduct: "Lanyards",
      roughQty: 100,
      status: "NEW",
    },
  });
  await prisma.inquiry.create({
    data: {
      customerId: customer2.id,
      description: "PVC IDs for new employees, 30 pcs with lanyard.",
      desiredProduct: "PVC ID",
      roughQty: 30,
      status: "NEW",
    },
  });
  await prisma.inquiry.create({
    data: {
      customerId: customer3.id,
      description: "Standees for a product launch, 3 pcs.",
      desiredProduct: "Standee",
      roughQty: 3,
      status: "CLOSED",
    },
  });

  // ---------- Quotations ----------
  const quote1 = await prisma.quotation.create({
    data: {
      inquiryId: inquiry1.id,
      customerId: customer1.id,
      quoteNumber: "QUO-2026-0001",
      status: "APPROVED",
      validUntil: new Date("2026-09-01"),
      total: 12500,
      lineItems: {
        create: [
          { productType: "Jersey", description: "Sublimation basketball jersey (full set)", qty: 25, unitPrice: 500 },
        ],
      },
    },
  });

  const quote2 = await prisma.quotation.create({
    data: {
      inquiryId: inquiry2.id,
      customerId: customer2.id,
      quoteNumber: "QUO-2026-0002",
      status: "APPROVED",
      validUntil: new Date("2026-09-10"),
      total: 15000,
      lineItems: {
        create: [{ productType: "DTF Shirt", description: "DTF printed cotton shirt", qty: 50, unitPrice: 300 }],
      },
    },
  });

  const quote3 = await prisma.quotation.create({
    data: {
      inquiryId: inquiry3.id,
      customerId: customer3.id,
      quoteNumber: "QUO-2026-0003",
      status: "APPROVED",
      validUntil: new Date("2026-09-15"),
      total: 45000,
      lineItems: {
        create: [
          { productType: "Signage", description: "Municipal fiesta welcome arch signage with install", qty: 1, unitPrice: 30000 },
          { productType: "Tarp", description: "Streamer tarpaulin 3x8ft", qty: 10, unitPrice: 1500 },
        ],
      },
    },
  });

  await prisma.quotation.create({
    data: {
      customerId: customer1.id,
      quoteNumber: "QUO-2026-0004",
      status: "SENT",
      validUntil: new Date("2026-09-05"),
      total: 5000,
      lineItems: { create: [{ productType: "Lanyards", description: "Custom printed lanyard", qty: 100, unitPrice: 50 }] },
    },
  });

  await prisma.quotation.create({
    data: {
      customerId: customer2.id,
      quoteNumber: "QUO-2026-0005",
      status: "DRAFT",
      total: 3000,
      lineItems: { create: [{ productType: "PVC ID", description: "PVC ID w/ lanyard", qty: 30, unitPrice: 100 }] },
    },
  });

  // ---------- Reward Rule ----------
  const rewardRule = await prisma.rewardRule.create({
    data: { name: "Standard Earn Rate", pointsPerCurrencyUnit: 1, currencyUnit: 100, active: true },
  });

  // ---------- Order 1: ON_HOLD unpaid ----------
  const order1 = await prisma.order.create({
    data: {
      quotationId: quote1.id,
      customerId: customer1.id,
      orderNumber: "ORD-2026-0001",
      status: "OPEN",
      paymentTermType: "STANDARD_PARTIAL",
      requiredPartialPct: 50,
      totalAmount: 12500,
    },
  });
  const order1jo1 = await prisma.jobOrder.create({
    data: {
      orderId: order1.id,
      joNumber: "JO-001",
      productType: "Jersey",
      description: "25x sublimation basketball jersey",
      quantity: 25,
      workflowTemplateId: jerseyTemplate.id,
      currentStageOrder: 1,
      status: "ON_HOLD",
      deadline: new Date("2026-09-10"),
    },
  });
  await prisma.payment.create({
    data: {
      orderId: order1.id,
      amount: 3000,
      method: "GCASH",
      status: "PENDING",
      recordedById: staff1.id,
      notes: "Customer uploaded proof, awaiting confirmation.",
    },
  });

  // ---------- Order 2: mid-production + QC/rework ----------
  const order2 = await prisma.order.create({
    data: {
      quotationId: quote2.id,
      customerId: customer2.id,
      orderNumber: "ORD-2026-0002",
      status: "IN_PRODUCTION",
      paymentTermType: "STANDARD_PARTIAL",
      requiredPartialPct: 50,
      totalAmount: 15000,
    },
  });
  await prisma.payment.create({
    data: { orderId: order2.id, amount: 7500, method: "BANK_TRANSFER", status: "CONFIRMED", recordedById: staff1.id },
  });

  // JO 2a: mid production (Pressing stage, IN_PROGRESS)
  const order2jo1 = await prisma.jobOrder.create({
    data: {
      orderId: order2.id,
      joNumber: "JO-001",
      productType: "DTF Shirt",
      description: "30x DTF shirt, dept. A design",
      quantity: 30,
      workflowTemplateId: dtfTemplate.id,
      currentStageOrder: 3,
      status: "IN_PROGRESS",
      deadline: new Date("2026-08-25"),
    },
  });
  await prisma.jobOrderStageLog.createMany({
    data: [
      { jobOrderId: order2jo1.id, stageName: "Design", stageOrder: 1, status: "COMPLETED", startedAt: new Date("2026-08-05"), completedAt: new Date("2026-08-06"), assignedToId: staff2.id },
      { jobOrderId: order2jo1.id, stageName: "DTF Printing", stageOrder: 2, status: "COMPLETED", startedAt: new Date("2026-08-06"), completedAt: new Date("2026-08-08"), assignedToId: prod1.id },
      { jobOrderId: order2jo1.id, stageName: "Pressing", stageOrder: 3, status: "IN_PROGRESS", startedAt: new Date("2026-08-09"), assignedToId: prod1.id },
    ],
  });

  // JO 2b: at QC with rework in progress
  const order2jo2 = await prisma.jobOrder.create({
    data: {
      orderId: order2.id,
      joNumber: "JO-002",
      productType: "DTF Shirt",
      description: "20x DTF shirt, dept. B design",
      quantity: 20,
      workflowTemplateId: dtfTemplate.id,
      currentStageOrder: 3,
      status: "REWORK",
      deadline: new Date("2026-08-22"),
    },
  });
  await prisma.jobOrderStageLog.createMany({
    data: [
      { jobOrderId: order2jo2.id, stageName: "Design", stageOrder: 1, status: "COMPLETED", startedAt: new Date("2026-08-03"), completedAt: new Date("2026-08-04"), assignedToId: staff2.id },
      { jobOrderId: order2jo2.id, stageName: "DTF Printing", stageOrder: 2, status: "COMPLETED", startedAt: new Date("2026-08-04"), completedAt: new Date("2026-08-06"), assignedToId: prod2.id },
      { jobOrderId: order2jo2.id, stageName: "Pressing", stageOrder: 3, status: "COMPLETED", startedAt: new Date("2026-08-06"), completedAt: new Date("2026-08-07"), assignedToId: prod2.id },
      { jobOrderId: order2jo2.id, stageName: "Pressing", stageOrder: 3, status: "IN_PROGRESS", startedAt: new Date("2026-08-08"), assignedToId: prod2.id, notes: "Reopened for rework of misaligned prints." },
    ],
  });
  const qc2 = await prisma.qCResult.create({
    data: {
      jobOrderId: order2jo2.id,
      stageName: "QC",
      inspectorId: prod2.id,
      result: "FAIL",
      quantityChecked: 20,
      quantityFailed: 4,
      defectNotes: "4 pcs have misaligned DTF print placement.",
      createdAt: new Date("2026-08-08"),
    },
  });
  await prisma.reworkRecord.create({
    data: {
      qcResultId: qc2.id,
      jobOrderId: order2jo2.id,
      defectDescription: "Misaligned DTF print placement on 4 pcs.",
      quantityAffected: 4,
      assignedStage: "Pressing",
      assignedToId: prod2.id,
      status: "IN_PROGRESS",
    },
  });

  // Files for JO 2a
  const customerFilePath = await writeSampleFile("customer-artwork.txt", "Customer-supplied artwork brief for DTF shirt design.");
  const draftPath = await writeSampleFile("design-draft-v1.txt", "Design draft v1 - placeholder design file.");
  const approvedPath = await writeSampleFile("design-approved-v2.txt", "Approved design v2 - placeholder design file.");
  const prodFilePath = await writeSampleFile("production-ready.txt", "Production-ready print file - placeholder.");
  await prisma.file.createMany({
    data: [
      { jobOrderId: order2jo1.id, uploadedById: custUser2.id, category: "CUSTOMER_FILE", version: 1, filename: "customer-artwork.txt", path: customerFilePath },
      { jobOrderId: order2jo1.id, uploadedById: staff2.id, category: "DESIGN_DRAFT", version: 1, filename: "design-draft-v1.txt", path: draftPath },
      { jobOrderId: order2jo1.id, uploadedById: staff2.id, category: "APPROVED_DESIGN", version: 2, isApproved: true, filename: "design-approved-v2.txt", path: approvedPath },
      { jobOrderId: order2jo1.id, uploadedById: prod1.id, category: "PRODUCTION_FILE", version: 1, isApproved: true, filename: "production-ready.txt", path: prodFilePath },
    ],
  });
  const qcEvidencePath = await writeSampleFile("qc-evidence-fail.txt", "QC evidence photo placeholder - misaligned print.");
  await prisma.file.create({
    data: { jobOrderId: order2jo2.id, uploadedById: prod2.id, category: "QC_EVIDENCE", version: 1, filename: "qc-evidence-fail.txt", path: qcEvidencePath },
  });

  // Inventory movements for order2
  const jerseyLot = await prisma.supplyLot.findFirstOrThrow({ where: { inventoryItemId: dtfFilm.id } });
  await prisma.inventoryMovement.create({
    data: { supplyLotId: jerseyLot.id, jobOrderId: order2jo1.id, type: "ALLOCATE", qty: -2, createdById: prod1.id },
  });

  // ---------- Order 3: fulfilled/completed, approved terms, rewards ----------
  const order3 = await prisma.order.create({
    data: {
      quotationId: quote3.id,
      customerId: customer3.id,
      orderNumber: "ORD-2026-0003",
      status: "COMPLETED",
      paymentTermType: "APPROVED_TERMS",
      termsApprovedBy: admin.name,
      termsReason: "Qualified government client — approved for production ahead of payment per standing agreement.",
      totalAmount: 45000,
      releaseException: false,
    },
  });
  await prisma.payment.create({
    data: { orderId: order3.id, amount: 45000, method: "BANK_TRANSFER", status: "CONFIRMED", recordedById: staff1.id },
  });

  const order3jo1 = await prisma.jobOrder.create({
    data: {
      orderId: order3.id,
      joNumber: "JO-001",
      productType: "Signage",
      description: "Municipal fiesta welcome arch signage with installation",
      quantity: 1,
      workflowTemplateId: signageTemplate.id,
      currentStageOrder: 5,
      status: "COMPLETED",
      deadline: new Date("2026-08-01"),
    },
  });
  const signageStages = await prisma.workflowStage.findMany({ where: { templateId: signageTemplate.id }, orderBy: { order: "asc" } });
  await prisma.jobOrderStageLog.createMany({
    data: signageStages.map((s, i) => ({
      jobOrderId: order3jo1.id,
      stageName: s.name,
      stageOrder: s.order,
      status: "COMPLETED" as const,
      startedAt: new Date(2026, 6, 10 + i),
      completedAt: new Date(2026, 6, 11 + i),
      assignedToId: prod1.id,
    })),
  });
  await prisma.qCResult.create({
    data: {
      jobOrderId: order3jo1.id,
      stageName: "QC",
      inspectorId: prod1.id,
      result: "PASS",
      quantityChecked: 1,
      quantityFailed: 0,
      createdAt: new Date("2026-07-14"),
    },
  });
  await prisma.fulfillment.create({
    data: {
      orderId: order3.id,
      jobOrderId: order3jo1.id,
      method: "INSTALLATION",
      status: "INSTALLED",
      scheduledDate: new Date("2026-07-16"),
      completedAt: new Date("2026-07-16"),
    },
  });

  const order3jo2 = await prisma.jobOrder.create({
    data: {
      orderId: order3.id,
      joNumber: "JO-002",
      productType: "Tarp",
      description: "10x streamer tarpaulin 3x8ft",
      quantity: 10,
      workflowTemplateId: tarpTemplate.id,
      currentStageOrder: 5,
      status: "COMPLETED",
      deadline: new Date("2026-07-15"),
    },
  });
  const tarpStages = await prisma.workflowStage.findMany({ where: { templateId: tarpTemplate.id }, orderBy: { order: "asc" } });
  await prisma.jobOrderStageLog.createMany({
    data: tarpStages.map((s, i) => ({
      jobOrderId: order3jo2.id,
      stageName: s.name,
      stageOrder: s.order,
      status: "COMPLETED" as const,
      startedAt: new Date(2026, 6, 8 + i),
      completedAt: new Date(2026, 6, 9 + i),
      assignedToId: prod2.id,
    })),
  });
  await prisma.qCResult.create({
    data: {
      jobOrderId: order3jo2.id,
      stageName: "QC",
      inspectorId: prod2.id,
      result: "PASS",
      quantityChecked: 10,
      quantityFailed: 0,
      createdAt: new Date("2026-07-12"),
    },
  });
  await prisma.fulfillment.create({
    data: {
      orderId: order3.id,
      jobOrderId: order3jo2.id,
      method: "DELIVERY",
      status: "DELIVERED",
      trackingNumber: "LP-TRK-000123",
      courier: "LBC",
      scheduledDate: new Date("2026-07-13"),
      completedAt: new Date("2026-07-13"),
    },
  });

  // Rewards for completed order3
  const pointsEarned = Math.floor((45000 / Number(rewardRule.currencyUnit)) * Number(rewardRule.pointsPerCurrencyUnit));
  await prisma.rewardTransaction.create({
    data: { customerId: customer3.id, orderId: order3.id, points: pointsEarned, type: "EARN", description: "Order ORD-2026-0003 completed" },
  });
  await prisma.rewardTransaction.create({
    data: { customerId: customer3.id, points: -50, type: "REDEEM", description: "Redeemed for tarpaulin discount voucher" },
  });
  await prisma.customer.update({
    where: { id: customer3.id },
    data: { rewardPointsBalance: pointsEarned - 50 },
  });

  console.log("Seed complete.");
  console.log("Login credentials (all passwords: password123):");
  console.log("  Admin:      admin@lp.test");
  console.log("  Staff:      staff1@lp.test / staff2@lp.test");
  console.log("  Production: prod1@lp.test / prod2@lp.test");
  console.log("  Customer:   juan@lp.test / maria@lp.test / ramon@lp.test");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
