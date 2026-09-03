"use client";

import { useRouter } from "next/navigation";
import { EditStaffModal } from "./edit-staff-modal";
import { DeleteStaffDialog } from "./delete-staff-dialog";

/**
 * Both the Edit and Delete Staff entry points live in the page header,
 * next to the name/status badges they affect. router.refresh() re-fetches
 * this (still server-rendered) page's data after either action succeeds,
 * so the header/status badge and the Users list update immediately — no
 * manual browser refresh, matching the rest of this app's established
 * "save closes the popup and the page updates in place" pattern.
 */
export function StaffHeaderActions({
  staffId,
  name,
  email,
  phone,
  active,
}: {
  staffId: string;
  name: string;
  email: string;
  phone: string | null;
  active: boolean;
}) {
  const router = useRouter();

  return (
    <div className="flex flex-wrap gap-2">
      <EditStaffModal staffId={staffId} currentName={name} currentEmail={email} currentPhone={phone} onSuccess={() => router.refresh()} />
      {active && <DeleteStaffDialog staffId={staffId} staffName={name} staffEmail={email} onSuccess={() => router.refresh()} />}
    </div>
  );
}
