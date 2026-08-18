"use client";

/**
 * Wraps a server-rendered card/tile so clicking it opens the existing
 * floating Chatbox (same "chatbox:open" event as the header ChatButton) —
 * kept as its own tiny Client Component so CustomerDashboard itself can
 * stay an async Server Component (function props can't cross that
 * boundary, same lesson as the 7th update's nav-icon fix).
 */
export function ChatOpenButton({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent("chatbox:open"))}
      className="block w-full text-left"
    >
      {children}
    </button>
  );
}
