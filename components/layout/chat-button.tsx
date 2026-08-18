"use client";

import { MessageCircle } from "lucide-react";

/** Header Chat icon (spec item 33) — opens the existing floating Chatbox generally, never a standalone Messages page. */
export function ChatButton() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent("chatbox:open"))}
      className="rounded-full p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
      aria-label="Open chat"
    >
      <MessageCircle className="h-5 w-5" />
    </button>
  );
}
