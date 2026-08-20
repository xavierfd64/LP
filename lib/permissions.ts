/**
 * Granular, action-level permissions a STAFF account can be granted.
 * ADMIN always bypasses this system entirely (never checked, never needs a
 * grant). CUSTOMER never participates in it. PRODUCTION keeps its existing
 * unrestricted access to production/QC actions (unchanged from before this
 * system existed) — a STAFF account can *additionally* be granted the same
 * production/fulfillment permissions if the business wants a general staff
 * member to also cover production-floor duties without a separate login.
 *
 * Mirrors the `Permission` enum in prisma/schema.prisma — keep both in sync.
 *
 * This file is data/types only (no Prisma import) so it's safe to import
 * from Client Components (e.g. the permission checkbox grid). The DB-backed
 * enforcement helpers live in lib/permissions-guard.ts.
 */
export const PERMISSION_GROUPS = [
  {
    category: "Inquiry",
    permissions: [
      { key: "INQUIRY_VIEW", label: "View inquiries" },
      { key: "INQUIRY_HANDLE", label: "Handle inquiries" },
      { key: "INQUIRY_MODIFY", label: "Modify inquiries" },
      { key: "INQUIRY_CANCEL", label: "Cancel inquiries" },
    ],
  },
  {
    category: "Quotation",
    permissions: [
      { key: "QUOTATION_VIEW", label: "View quotations" },
      { key: "QUOTATION_CREATE", label: "Create quotations" },
      { key: "QUOTATION_EDIT", label: "Edit quotations" },
      { key: "QUOTATION_SEND", label: "Send quotations" },
      { key: "QUOTATION_HANDLE_MODIFICATION", label: "Handle modification requests" },
      { key: "QUOTATION_APPROVE_REJECT", label: "Approve/reject (rush bypass)" },
      { key: "QUOTATION_CANCEL", label: "Cancel quotations" },
    ],
  },
  {
    category: "Orders",
    permissions: [
      { key: "ORDER_VIEW", label: "View orders" },
      { key: "ORDER_CREATE", label: "Create orders" },
      { key: "ORDER_MODIFY", label: "Modify orders" },
      { key: "ORDER_HANDLE_MODIFICATION", label: "Handle modification requests" },
      { key: "ORDER_UPDATE_STATUS", label: "Update order status" },
      { key: "ORDER_CANCEL", label: "Cancel orders" },
    ],
  },
  {
    category: "Payments",
    permissions: [
      { key: "PAYMENT_VIEW", label: "View payments" },
      { key: "PAYMENT_RECORD", label: "Record payment" },
      { key: "PAYMENT_VERIFY", label: "Verify payment" },
      { key: "PAYMENT_REJECT", label: "Reject payment" },
      { key: "PAYMENT_EDIT", label: "Edit payment" },
      { key: "PAYMENT_REFUND", label: "Process refund" },
    ],
  },
  {
    category: "Production",
    permissions: [
      { key: "PRODUCTION_VIEW", label: "View production" },
      { key: "PRODUCTION_UPDATE_STAGE", label: "Update production stage" },
      { key: "PRODUCTION_MARK_STAGE_COMPLETE", label: "Mark production stage complete" },
      { key: "PRODUCTION_MARK_COMPLETE", label: "Mark production complete" },
    ],
  },
  {
    category: "Fulfillment",
    permissions: [
      { key: "FULFILLMENT_VIEW", label: "View fulfillment" },
      { key: "FULFILLMENT_SCHEDULE_PICKUP", label: "Schedule pickup" },
      { key: "FULFILLMENT_SCHEDULE_DELIVERY", label: "Schedule delivery" },
      { key: "FULFILLMENT_UPDATE_DELIVERY_STATUS", label: "Update delivery status" },
      { key: "FULFILLMENT_MARK_DELIVERED", label: "Mark delivered" },
      { key: "FULFILLMENT_MARK_INSTALLED", label: "Mark installed" },
    ],
  },
  {
    category: "Rewards",
    permissions: [
      { key: "REWARDS_VIEW", label: "View rewards" },
      { key: "REWARDS_PROCESS_REDEMPTION", label: "Process redemption" },
      { key: "REWARDS_MANAGE_CONFIG", label: "Manage reward configuration" },
    ],
  },
  {
    category: "Communication",
    permissions: [
      { key: "COMMUNICATION_VIEW", label: "View customer conversations" },
      { key: "COMMUNICATION_SEND", label: "Send messages" },
      { key: "COMMUNICATION_MANAGE", label: "Manage conversations" },
      { key: "COMMUNICATION_TRANSFER", label: "Transfer conversations to another Staff member" },
      { key: "COMMUNICATION_ASSIGN", label: "Assign/reassign conversations" },
      { key: "COMMUNICATION_GROUP", label: "Create and manage group chats" },
      { key: "COMMUNICATION_ATTACHMENT", label: "Send file/image attachments" },
      { key: "COMMUNICATION_REFERENCE_TRANSACTION", label: "Reference an Inquiry/Quotation/Job Order in chat" },
      { key: "COMMUNICATION_SEARCH_CUSTOMER", label: "Search customers and start new conversations" },
      { key: "MESSENGER_DISPATCH", label: "Send Messenger production updates from the Kanban" },
    ],
  },
  {
    category: "Reports",
    permissions: [
      { key: "REPORTS_VIEW", label: "View reports" },
      { key: "REPORTS_EXPORT", label: "Export reports" },
    ],
  },
  {
    // Aug 20 1st update — Financial Foundation. Deliberately separate from
    // "Reports" (viewing the P&L is gated by the existing REPORTS_VIEW,
    // since a P&L is just another report) — these three are specifically
    // about internal cost/expense data: recording expenses is a distinct
    // capability from merely seeing cost figures embedded in a Quotation
    // or Order (COST_VIEW), which is itself distinct from managing the
    // Service Master's own cost configuration (reuses existing
    // SERVICE_MANAGE, not a new key, since that's already the "edit a
    // Service" permission and cost is just one more field on that form).
    category: "Financial",
    permissions: [
      { key: "EXPENSE_VIEW", label: "View operating expenses" },
      { key: "EXPENSE_MANAGE", label: "Add/edit/delete operating expenses and categories" },
      { key: "COST_VIEW", label: "View internal production cost and profit margin on Quotations/Orders/Dashboard" },
    ],
  },
  {
    category: "Customer Management",
    permissions: [
      { key: "CUSTOMER_VIEW", label: "View customers" },
      { key: "CUSTOMER_CREATE", label: "Create customers" },
      { key: "CUSTOMER_EDIT", label: "Edit customers" },
      { key: "CUSTOMER_ACTIVATE_DEACTIVATE", label: "Activate/deactivate customers" },
    ],
  },
  {
    category: "User Management",
    permissions: [
      { key: "USER_VIEW", label: "View users" },
      { key: "USER_CREATE", label: "Create users" },
      { key: "USER_EDIT", label: "Edit users" },
      { key: "USER_ACTIVATE_DEACTIVATE", label: "Activate/deactivate users" },
      { key: "USER_MANAGE_PERMISSIONS", label: "Manage Staff permissions" },
    ],
  },
  {
    category: "Documents",
    permissions: [
      { key: "DOCUMENT_VIEW", label: "View shared documents" },
      { key: "DOCUMENT_SHARE", label: "Generate document sharing links" },
      { key: "DOCUMENT_DOWNLOAD", label: "Allow PDF download on shared links" },
      { key: "DOCUMENT_REVOKE", label: "Revoke/regenerate document sharing links" },
      { key: "ORDER_TRACKING_MANAGE", label: "Generate/revoke Customer Order Tracking links" },
    ],
  },
  {
    category: "Statement of Account",
    permissions: [
      { key: "SOA_VIEW", label: "View statements of account" },
      { key: "SOA_GENERATE", label: "Generate statements of account" },
      { key: "SOA_SHARE", label: "Share/send statements of account" },
      { key: "SOA_REVOKE", label: "Revoke SOA sharing links" },
    ],
  },
  {
    category: "Service Master",
    permissions: [
      { key: "SERVICE_VIEW", label: "View the Service/Product Master" },
      { key: "SERVICE_MANAGE", label: "Add/edit services and their production flows" },
    ],
  },
  {
    category: "Email",
    // Also gates the Messenger Log (same "notification delivery log" role, one permission) rather than adding a second near-identical grant.
    permissions: [{ key: "EMAIL_LOG_VIEW", label: "View email/Messenger logs and retry failed sends" }],
  },
] as const;

export type Permission = (typeof PERMISSION_GROUPS)[number]["permissions"][number]["key"];

export const ALL_PERMISSIONS: Permission[] = PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => p.key));

export const PERMISSION_LABELS: Record<Permission, string> = Object.fromEntries(
  PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => [p.key, p.label]))
) as Record<Permission, string>;

/**
 * Optional starting-point templates for the Admin's Staff & Permissions
 * page. Purely a UI convenience — applying one just pre-checks these boxes;
 * Admin can still add/remove individual permissions afterward. Not stored
 * anywhere as a named "role", so a staff member is never locked into one.
 */
export const PERMISSION_PRESETS: Record<string, Permission[]> = {
  "Sales Staff": [
    "INQUIRY_VIEW",
    "INQUIRY_HANDLE",
    "CUSTOMER_VIEW",
    "CUSTOMER_CREATE",
    "QUOTATION_VIEW",
    "QUOTATION_CREATE",
    "QUOTATION_EDIT",
    "QUOTATION_SEND",
    "QUOTATION_HANDLE_MODIFICATION",
    "ORDER_VIEW",
    "ORDER_CREATE",
    "REPORTS_VIEW",
    "COMMUNICATION_VIEW",
    "COMMUNICATION_SEND",
    "COMMUNICATION_ATTACHMENT",
    "COMMUNICATION_REFERENCE_TRANSACTION",
    "COMMUNICATION_SEARCH_CUSTOMER",
    "DOCUMENT_VIEW",
    "DOCUMENT_SHARE",
    "DOCUMENT_DOWNLOAD",
    "ORDER_TRACKING_MANAGE",
  ],
  Cashier: [
    "ORDER_VIEW",
    "PAYMENT_VIEW",
    "PAYMENT_RECORD",
    "PAYMENT_VERIFY",
    "PAYMENT_REJECT",
    "SOA_VIEW",
    "SOA_GENERATE",
    "SOA_SHARE",
    "COMMUNICATION_VIEW",
    "COMMUNICATION_SEND",
    "COMMUNICATION_ATTACHMENT",
    "COMMUNICATION_REFERENCE_TRANSACTION",
  ],
  "Customer Service": [
    "INQUIRY_VIEW",
    "INQUIRY_HANDLE",
    "CUSTOMER_VIEW",
    "CUSTOMER_CREATE",
    "CUSTOMER_EDIT",
    "QUOTATION_VIEW",
    "ORDER_VIEW",
    "PAYMENT_VIEW",
    "REPORTS_VIEW",
    "COMMUNICATION_VIEW",
    "COMMUNICATION_SEND",
    "COMMUNICATION_MANAGE",
    "COMMUNICATION_TRANSFER",
    "COMMUNICATION_ASSIGN",
    "COMMUNICATION_GROUP",
    "COMMUNICATION_ATTACHMENT",
    "COMMUNICATION_REFERENCE_TRANSACTION",
    "COMMUNICATION_SEARCH_CUSTOMER",
    "MESSENGER_DISPATCH",
    "DOCUMENT_VIEW",
    "DOCUMENT_SHARE",
    "DOCUMENT_DOWNLOAD",
    "DOCUMENT_REVOKE",
    "ORDER_TRACKING_MANAGE",
    "SOA_VIEW",
    "SOA_GENERATE",
    "SOA_SHARE",
    "SOA_REVOKE",
    "EMAIL_LOG_VIEW",
  ],
  "Production Staff": [
    "ORDER_VIEW",
    "PRODUCTION_VIEW",
    "PRODUCTION_UPDATE_STAGE",
    "PRODUCTION_MARK_STAGE_COMPLETE",
    "PRODUCTION_MARK_COMPLETE",
  ],
  "Fulfillment Staff": [
    "ORDER_VIEW",
    "FULFILLMENT_VIEW",
    "FULFILLMENT_SCHEDULE_PICKUP",
    "FULFILLMENT_SCHEDULE_DELIVERY",
    "FULFILLMENT_UPDATE_DELIVERY_STATUS",
    "FULFILLMENT_MARK_DELIVERED",
    "FULFILLMENT_MARK_INSTALLED",
  ],
  Manager: ALL_PERMISSIONS.filter((p) => !p.startsWith("USER_")),
};
