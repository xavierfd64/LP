"use client";

import { useEffect, useState } from "react";
import { Copy, Check, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, Input, Label } from "@/components/ui/input";
import {
  generateTrackingLinkAction,
  revokeTrackingLinkAction,
  regenerateTrackingLinkAction,
} from "@/app/actions/order-tracking";

export type ActiveTrackingLink = { id: string; token: string; expiresAt: string | null };

export function TrackingLinkManager({ orderId, activeLink }: { orderId: string; activeLink: ActiveTrackingLink | null }) {
  if (!activeLink) return <GenerateForm orderId={orderId} />;
  return <ActiveLinkPanel orderId={orderId} link={activeLink} />;
}

function GenerateForm({ orderId }: { orderId: string }) {
  const action = generateTrackingLinkAction.bind(null, orderId);
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <ExpiryFields />
      <Button type="submit" size="sm">
        Generate Tracking Link
      </Button>
    </form>
  );
}

function ActiveLinkPanel({ orderId, link }: { orderId: string; link: ActiveTrackingLink }) {
  const [copied, setCopied] = useState(false);
  const [url, setUrl] = useState("");

  useEffect(() => {
    setUrl(`${window.location.origin}/track/${link.token}`);
  }, [link.token]);

  const revoke = revokeTrackingLinkAction.bind(null, link.id);
  const regenerate = regenerateTrackingLinkAction.bind(null, orderId);

  async function copyLink() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function shareLink() {
    if (navigator.share) {
      try {
        await navigator.share({ title: "Order Tracking", url });
      } catch {
        // user cancelled — no-op
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
        <a href={`mailto:?subject=Order Tracking&body=${encodeURIComponent(url)}`} className="text-xs text-brand-600 underline">
          Email
        </a>
        <a href={`sms:?body=${encodeURIComponent(url)}`} className="text-xs text-brand-600 underline">
          SMS
        </a>
      </div>
      <p className="text-xs text-slate-500">
        {link.expiresAt ? `Expires ${new Date(link.expiresAt).toLocaleDateString()}` : "No expiration"}
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <form action={revoke}>
          <Button type="submit" size="sm" variant="destructive">
            Revoke
          </Button>
        </form>
        <form action={regenerate} className="flex flex-wrap items-end gap-2">
          <ExpiryFields />
          <Button type="submit" size="sm" variant="outline">
            Regenerate
          </Button>
        </form>
      </div>
    </div>
  );
}

function ExpiryFields() {
  const [option, setOption] = useState("none");
  return (
    <div className="flex items-end gap-2">
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
