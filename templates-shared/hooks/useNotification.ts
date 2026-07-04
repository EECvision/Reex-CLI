import { useCallback, useEffect, useRef, useState } from "react";

export type NotificationType = "success" | "error" | "warning" | "info";

export interface ApiNotification {
  id: string;
  type: NotificationType;
  message: string;
  statusCode?: number;
  timestamp: string;
}

export interface UseNotificationOptions {
  maxNotifications?: number;
  autoDismissMs?: number | false;
}

export const NOTIFICATION_EVENT = "api:notification" as const;

const DEFAULT_MAX = 10;
const DEFAULT_AUTO_DISMISS_MS = 5000;

/**
 * Subscribes to API notifications dispatched by the API client's error interceptor.
 *
 * @example
 * const { notifications, dismiss, dismissAll } = useNotification();
 *
 * return (
 *   <div className="toast-container">
 *     {notifications.map((n) => (
 *       <div key={n.id} className={`toast toast--${n.type}`}>
 *         <p>{n.message}</p>
 *         <button onClick={() => dismiss(n.id)}>✕</button>
 *       </div>
 *     ))}
 *   </div>
 * );
 */
export const useNotification = (options?: UseNotificationOptions) => {
  const {
    maxNotifications = DEFAULT_MAX,
    autoDismissMs = DEFAULT_AUTO_DISMISS_MS,
  } = options ?? {};

  const [notifications, setNotifications] = useState<ApiNotification[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const dismissAll = useCallback(() => {
    setNotifications([]);
    timersRef.current.forEach((timer) => clearTimeout(timer));
    timersRef.current.clear();
  }, []);

  const pushNotification = useCallback(
    (notification: Omit<ApiNotification, "id" | "timestamp">) => {
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent(NOTIFICATION_EVENT, {
            detail: {
              ...notification,
              id: crypto.randomUUID(),
              timestamp: new Date().toISOString(),
            },
          }),
        );
      }
    },
    [],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Captured for safe cleanup in React Strict Mode
    const timers = timersRef.current;

    const handleNotification = (event: Event) => {
      const notification = (event as CustomEvent<ApiNotification>).detail;
      if (!notification?.id) return;

      setNotifications((prev) => {
        if (prev.some((n) => n.id === notification.id)) return prev;
        const next = [...prev, notification];
        return next.length > maxNotifications
          ? next.slice(next.length - maxNotifications)
          : next;
      });

      if (autoDismissMs !== false) {
        const timer = setTimeout(() => {
          setNotifications((prev) => prev.filter((n) => n.id !== notification.id));
          timers.delete(notification.id);
        }, autoDismissMs);

        timers.set(notification.id, timer);
      }
    };

    window.addEventListener(NOTIFICATION_EVENT, handleNotification);

    return () => {
      window.removeEventListener(NOTIFICATION_EVENT, handleNotification);
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
    };
  }, [maxNotifications, autoDismissMs]);

  return { notifications, dismiss, dismissAll, pushNotification };
};