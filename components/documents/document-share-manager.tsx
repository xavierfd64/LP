"use client";

import { useEffect, useState } from "react";
import { Copy, Check, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, Input, Label } from "@/components/ui/input";
import {
  generateDocumentShareLinkAction,
  revokeDocumentShareLinkAction,
  regenerateDocumentShareLinkAction,
} from "@/app/actions/document-sharing";
import type { ShareDocType } from "@/lib/document-sharing";

export type ActiveShareLink = { id: string; token: string; accessLevel: "VIEW_ONLY" | "VIEW_DOWNLOAD"; expiresAt: string | null };

/**
 * Shares a single Quotation/Invoice/Job Order document — deliberately a
 * separate link type and separate management UI from the Customer Order
 * Tracking Link (TrackingLinkManager), per spec: two clearly separate
 * systems, not one combined permission set or link type. Customers get a
 * reduced form (no access-level choice — self-service sharing is always
 * View Only; see generateDocumentShareLinkAction).
 */
export function DocumentShareManager({
  docType,
  docId,
  activeLink,
  isCustomer,
}: {
  docType: ShareDocType;
  docId: string;
  activeLink: ActiveShareLink | null;
  isCustomer: boolean;
}) {
  if (!activeLink) return <GenerateForm docType={docType} docId={docId} isCustomer={isCustomer} />;
  return <ActiveLinkPanel docType={docType} docId={docId} link={activeLink} isCustomer={isCustomer} />;
}

function GenerateForm({ docType, docId, isCustomer }: { docType: ShareDocType; docId: string; isCustomer: boolean }) {
  const action = generateDocumentShareLinkAction.bind(null, docType, docId);
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <AccessAndExpiryFields isCustomer={isCustomer} />
      <Button type="submit" size="sm">
        Share Document
      </Button>
    </form>
  );
}

function ActiveLinkPanel({
  docType,
  docId,
  link,
  isCustomer,
}: {
  docType: ShareDocType;
  docId: string;
  link: ActiveShareLink;
  isCustomer: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [url, setUrl] = useState("");

  useEffect(() => {
    setUrl(`${window.location.origin}/documents/${link.token}`);
  }, [link.token]);

  const revoke = revokeDocumentShareLinkAction.bind(null, link.id);
  const regenerate = regenerateDocumentShareLinkAction.bind(null, docType, docId);

  async function copyLink() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function shareLink() {
    if (navigator.share) {
      try {
        await navigator.share({ title: "Shared Document", url });
      } catch {
        // user cancelled
      }
    } else {
      await copyLink();
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input readOnly value={url} className="min-w-0 flex-1" onFocus={(e) => e.currentTarget.select()} />
        <Button type="button" size="sm" variant="outline" onClick={copyLink}>
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? "Copied" : "Copy"}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={shareLink}>
          <Share2 className="h-4 w-4" /> Share
        </Button>
        <a href={`mailto:?subject=Shared Document&body=${encodeURIComponent(url)}`} className="text-xs text-brand-600 underline">
          Email
        </a>
        <a href={`sms:?body=${encodeURIComponent(url)}`} className="text-xs text-brand-600 underline">
          SMS
        </a>
      </div>
      <p className="text-xs text-slate-500">
        {link.accessLevel === "VIEW_DOWNLOAD" ? "View + Download PDF" : "View Only"} ·{" "}
        {link.expiresAt ? `Expires ${new Date(link.expiresAt).toLocaleDateString()}` : "No expiration"}
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <form action={revoke}>
          <Button type="submit" size="sm" variant="destructive">
            Revoke
          </Button>
        </form>
        <form action={regenerate} className="flex flex-wrap items-end gap-2">
          <AccessAndExpiryFields isCustomer={isCustomer} />
          <Button type="submit" size="sm" variant="outline">
            Regenerate
          </Button>
        </form>
      </div>
    </div>
  );
}

function AccessAndExpiryFields({ isCustomer }: { isCustomer: boolean }) {
  const [option, setOption] = useState("none");
  return (
    <div className="flex flex-wrap items-end gap-2">
      {!isCustomer && (
        <div>
          <Label htmlFor="accessLevel">Access</Label>
          <Select id="accessLevel" name="accessLevel" defaultValue="VIEW_ONLY">
            <option value="VIEW_ONLY">View Only</option>
            <option value="VIEW_DOWNLOAD">View + Download PDF</option>
          </Select>
        </div>
      )}
      <div>
        <Label htmlFor="expiresOption">Expiration</Label>
        <Select id="expiresOption" name="expiresOption" value={option} onChange={(e) => setOption(e.target.value)}>
          <option value="none">No expiration</option>
          <option value="7">7 days</option>
          <option value="30">30 days</option>
          <option value="custom">Custom</option>
        </Select>
      </div>
      {option === "custom" && (
        <div>
          <Label htmlFor="customDate">Expires on</Label>
          <Input id="customDate" name="customDate" type="date" />
        </div>
      )}
    </div>
  );
}
