"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { cn, formatDateTime } from "@/lib/utils";
import { markAllNotificationsReadAction, openNotificationAction, markNotificationReadAction } from "@/app/actions/notifications";

/** Notification types created by the messaging system (see app/actions/messages.ts, lib/auto-assignment.ts, lib/response-reminders.ts) — all link to /messages/{conversationId}. Clicking these should open the floating Chatbox straight to that conversation instead of navigating to the old standalone page. */
const CHAT_NOTIFICATION_TYPES = new Set([
  "NEW_MESSAGE",
  "CONVERSATION_ASSIGNED",
  "PRIVATE_CHAT_STARTED",
  "GROUP_CHAT_CREATED",
  "CHAT_RESPONSE_REMINDER",
]);

type NotificationItem = {
  id: string;
  type: string;
  message: string;
  link: string | null;
  read: boolean;
  createdAt: Date;
};

export function NotificationBell({
  notifications: initialNotifications,
  unreadCount: initialUnreadCount,
}: {
  notifications: NotificationItem[];
  unreadCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState(initialNotifications);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);

  useEffect(() => {
    function onNotification(e: Event) {
      const detail = (e as CustomEvent).detail as {
        notification: { id: string; type: string; message: string; link: string | null; read: boolean; createdAt: string };
      };
      const n = detail.notification;
      setNotifications((prev) => [{ ...n, createdAt: new Date(n.createdAt) }, ...prev].slice(0, 15));
      if (!n.read) setUnreadCount((prev) => prev + 1);
    }
    window.addEventListener("realtime:notification", onNotification);
    return () => window.removeEventListener("realtime:notification", onNotification);
  }, []);

  // The Production module's mobile bottom nav (illustration 6) has its own
  // "Notifications" tab rather than duplicating this dropdown's logic —
  // it just asks this existing bell to open, the same cross-component
  // event pattern the chat widget already uses ("chatbox:open").
  useEffect(() => {
    function onOpen() {
      setOpen(true);
    }
    window.addEventListener("production:open-notifications", onOpen);
    return () => window.removeEventListener("production:open-notifications", onOpen);
  }, []);

  function handleMarkAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
  }

  function handleOpen(id: string) {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    setUnreadCount((prev) => {
      const wasUnread = notifications.find((n) => n.id === id)?.read === false;
      return wasUnread ? Math.max(0, prev - 1) : prev;
    });
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-full p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-2 w-[min(20rem,90vw)] rounded-md border border-slate-200 bg-white shadow-lg">
            <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
              <p className="text-sm font-semibold text-slate-900">Notifications</p>
              {unreadCount > 0 && (
                <form action={markAllNotificationsReadAction} onSubmit={handleMarkAllRead}>
                  <button type="submit" className="text-xs text-slate-500 underline hover:text-slate-900">
                    Mark all read
                  </button>
                </form>
              )}
            </div>
            <div className="max-h-96 overflow-y-auto">
              {notifications.length === 0 && (
                <p className="px-3 py-6 text-center text-sm text-slate-400">No notifications yet.</p>
              )}
              {notifications.map((n) => {
                const isChat = CHAT_NOTIFICATION_TYPES.has(n.type) && n.link?.startsWith("/messages/");
                const rowClassName = cn(
                  "block w-full border-b border-slate-50 px-3 py-2 text-left text-sm hover:bg-slate-50",
                  !n.read && "bg-brand-50/60"
                );
                const rowContent = (
                  <>
                    <p className={cn("text-slate-800", !n.read && "font-medium")}>{n.message}</p>
                    <p className="mt-0.5 text-xs text-slate-400">{formatDateTime(n.createdAt)}</p>
                  </>
                );

                if (isChat) {
                  const conversationId = n.link!.slice("/messages/".length);
                  return (
                    <button
                      key={n.id}
                      type="button"
                      className={rowClassName}
                      onClick={() => {
                        handleOpen(n.id);
                        setOpen(false);
                        markNotificationReadAction(n.id);
                        window.dispatchEvent(new CustomEvent("chatbox:open-conversation", { detail: { conversationId } }));
                      }}
                    >
                      {rowContent}
                    </button>
                  );
                }

                const openAction = openNotificationAction.bind(null, n.id);
                return (
                  <form key={n.id} action={openAction} onSubmit={() => handleOpen(n.id)}>
                    <button type="submit" className={rowClassName}>
                      {rowContent}
                    </button>
                  </form>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
