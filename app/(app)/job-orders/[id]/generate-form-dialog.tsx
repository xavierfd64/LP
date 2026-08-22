"use client";

import { useActionState, useState } from "react";
import { createCustomerFormAction } from "@/app/actions/customer-form";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "@/components/ui/modal";

/**
 * Generates the Customer Form for this Job Order (Aug 22 Update 5) — one
 * form per job order (createCustomerFormAction rejects a second one),
 * created together with its first secure link and an immediate automatic
 * delivery attempt over Email/Messenger (spec 2.2). This is the "natural
 * attachment point" the form workflow hangs off of, next to the existing
 * Share Document card.
 */
export function GenerateFormDialog({ jobOrderId, defaultTitle, defaultQty }: { jobOrderId: string; defaultTitle: string; defaultQty: number }) {
  const [open, setOpen] = useState(false);
  const action = createCustomerFormAction.bind(null, jobOrderId);
  const [error, formAction, pending] = useActionState(action, undefined);

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        Generate Customer Form
      </Button>
      <Modal open={open} onClose={() => setOpen(false)}>
        <ModalHeader title="Generate Customer Form" subtitle="Creates the form and sends its link to the customer." onClose={() => setOpen(false)} />
        <form action={formAction}>
          <ModalBody>
            {error && <Alert tone="error">{error}</Alert>}
            <div>
              <Label htmlFor="title">Form Title</Label>
              <Input id="title" name="title" required defaultValue={defaultTitle} />
            </div>
            <div>
              <Label htmlFor="instructions">Instructions (optional)</Label>
              <Textarea id="instructions" name="instructions" rows={2} placeholder="Please fill out this form with your requirements." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="deadline">Form Deadline (optional)</Label>
                <Input id="deadline" name="deadline" type="date" />
              </div>
              <div>
                <Label htmlFor="starterQty">Starter Quantity</Label>
                <Input id="starterQty" name="starterQty" type="number" min={1} defaultValue={defaultQty} />
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Generating..." : "Generate & Send"}
            </Button>
          </ModalFooter>
        </form>
      </Modal>
    </>
  );
}
