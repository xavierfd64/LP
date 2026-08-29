"use client";

import { useEffect, useState, useTransition } from "react";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Label, Select } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { getGraphicArtistsAction, assignDesignJobAction, unassignDesignJobAction, type GraphicArtistOption } from "@/app/actions/design";
import type { DesignQueueRow } from "@/lib/design-dashboard-data";

/** Manual assignment (workflow spec "B. Manual assignment by Admin or
 * authorized Staff") — DESIGN_MANAGE only, surfaced from the queue
 * table's "Assign" action. Shows each Graphic Artist's current pending
 * count so a human making the call sees the same "who's free" context
 * the automatic picker uses. */
export function AssignDesignJobDialog({
  row,
  onClose,
  onAssigned,
}: {
  row: DesignQueueRow;
  onClose: () => void;
  onAssigned: () => void;
}) {
  const [artists, setArtists] = useState<GraphicArtistOption[] | null>(null);
  const [selected, setSelected] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    getGraphicArtistsAction().then((list) => {
      setArtists(list);
      setSelected(row.assignedToId ?? list[0]?.id ?? "");
    });
  }, [row.assignedToId]);

  function submit() {
    if (!selected) return;
    setError(null);
    startTransition(async () => {
      const res = await assignDesignJobAction(row.stageLogId, selected);
      if (!res.ok) {
        setError(res.error ?? "Something went wrong.");
        return;
      }
      onAssigned();
    });
  }

  function unassign() {
    setError(null);
    startTransition(async () => {
      const res = await unassignDesignJobAction(row.stageLogId);
      if (!res.ok) {
        setError(res.error ?? "Something went wrong.");
        return;
      }
      onAssigned();
    });
  }

  return (
    <Modal open onClose={onClose} maxWidthClassName="max-w-md">
      <ModalHeader title={<>Assign Design Job <span className="font-normal text-slate-500">{row.joNumber}</span></>} onClose={onClose} />
      <ModalBody>
        {error && <Alert tone="error">{error}</Alert>}
        {!artists ? (
          <p className="py-4 text-center text-sm text-slate-400">Loading…</p>
        ) : artists.length === 0 ? (
          <p className="text-sm text-slate-500">No active Graphic Artists are available to assign.</p>
        ) : (
          <div>
            <Label htmlFor="artist">Graphic Artist</Label>
            <Select id="artist" value={selected} onChange={(e) => setSelected(e.target.value)}>
              {artists.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} — {a.pendingCount} pending {a.pendingCount === 1 ? "layout" : "layouts"}
                </option>
              ))}
            </Select>
          </div>
        )}
      </ModalBody>
      <ModalFooter>
        {row.assignedToId && row.status === "READY" && (
          <Button type="button" variant="outline" disabled={pending} onClick={unassign} className="mr-auto">
            Unassign
          </Button>
        )}
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="button" disabled={pending || !selected} onClick={submit}>
          {pending ? "Assigning…" : "Assign"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
