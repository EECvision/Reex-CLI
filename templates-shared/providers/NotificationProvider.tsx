// @internal — No changes needed
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  type ApiNotification,
  NOTIFICATION_EVENT,
  pushNotification,
  NotificationContext,
  type NotificationContextValue,
} from "../hooks/notification";

export interface UseNotificationOptions {
  maxNotifications?: number;
  autoDismissMs?: number | false;
}

const DEFAULT_MAX = 10;
const DEFAULT_AUTO_DISMISS_MS = 5000;

export const NotificationProvider = ({
  children,
  options,
}: {
  children: ReactNode;
  options?: UseNotificationOptions;
}) => {
  const {
    maxNotifications = DEFAULT_MAX,
    autoDismissMs = DEFAULT_AUTO_DISMISS_MS,
  } = options ?? {};

  const [notifications, setNotifications] = useState<ApiNotification[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

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

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Captured for safe cleanup in React Strict Mode
    const timers = timersRef.current;

    const handleNotification = (event: Event) => {
      const notification = (event as CustomEvent<ApiNotification>).detail;
      if (!notification?.id) return;

      setNotifications((prev) => {
        if (prev.some((n) => n.id === notification.id)) {
          return prev;
        }

        const next = [...prev, notification];

        if (next.length <= maxNotifications) {
          return next;
        }

        // Remove timers for notifications that are being evicted
        const removed = next.slice(0, next.length - maxNotifications);

        // Defer the side-effect to keep the state updater pure!
        queueMicrotask(() => {
          removed.forEach(({ id }) => {
            const timer = timers.get(id);
            if (timer) {
              clearTimeout(timer);
              timers.delete(id);
            }
          });
        });

        return next.slice(next.length - maxNotifications);
      });

      if (autoDismissMs !== false) {
        const timer = setTimeout(() => {
          dismiss(notification.id);
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
  }, [maxNotifications, autoDismissMs, dismiss]);

  const contextValue = useMemo<NotificationContextValue>(
    () => ({
      notifications,
      dismiss,
      dismissAll,
      pushNotification,
    }),
    [notifications, dismiss, dismissAll],
  );

  return (
    <NotificationContext.Provider value={contextValue}>
      {children}
    </NotificationContext.Provider>
  );
};
