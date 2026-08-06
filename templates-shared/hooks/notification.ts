"use client";

import { createContext } from "react";

export type NotificationType = "success" | "error" | "warning" | "info";

export interface ApiNotification {
  id: string;
  type: NotificationType;
  message: string;
  statusCode?: number;
  timestamp: string;
}

export const NOTIFICATION_EVENT = "api:notification" as const;

// Suppresses duplicate toasts when the same error fires multiple times in quick succession.
const DEDUPE_WINDOW_MS = 2500;
const recentNotifications = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Pushes an error or status notification outside of React (e.g. from API service files).
 * Identical notifications within 2.5 s are suppressed to prevent duplicate toasts.
 *
 * @example
 * pushNotification({ type: "error", message: "Failed to load profile", statusCode: 500 });
 */
export const pushNotification = (
  notification: Omit<ApiNotification, "id" | "timestamp">,
) => {
  if (typeof window === "undefined") return;

  const dedupeKey = `${notification.type}:${notification.statusCode ?? ""}:${notification.message}`;

  if (recentNotifications.has(dedupeKey)) return;

  // Auto-expire the key so the same error can reappear after the window closes.
  const timer = setTimeout(() => recentNotifications.delete(dedupeKey), DEDUPE_WINDOW_MS);
  recentNotifications.set(dedupeKey, timer);

  window.dispatchEvent(
    new CustomEvent(NOTIFICATION_EVENT, {
      detail: {
        ...notification,
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
      },
    }),
  );
};

export interface NotificationContextValue {
  notifications: ApiNotification[];
  dismiss: (id: string) => void;
  dismissAll: () => void;
  pushNotification: (
    notification: Omit<ApiNotification, "id" | "timestamp">,
  ) => void;
}

export const NotificationContext = createContext<NotificationContextValue | null>(
  null,
);
