import type { ReactNode } from "react";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

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

interface NotificationContextValue {
  notifications: ApiNotification[];
  dismiss: (id: string) => void;
  dismissAll: () => void;
  pushNotification: (
    notification: Omit<ApiNotification, "id" | "timestamp">,
  ) => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(
  null,
);

// Standalone push function for non-React contexts (like Axios interceptors)
export const pushNotification = (
  notification: Omit<ApiNotification, "id" | "timestamp">,
) => {
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
};

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
        if (prev.some((n) => n.id === notification.id)) return prev;
        const next = [...prev, notification];
        return next.length > maxNotifications
          ? next.slice(next.length - maxNotifications)
          : next;
      });

      if (autoDismissMs !== false) {
        const timer = setTimeout(() => {
          setNotifications((prev) =>
            prev.filter((n) => n.id !== notification.id),
          );
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

  const contextValue: NotificationContextValue = {
    notifications,
    dismiss,
    dismissAll,
    pushNotification, // Reference the standalone function for ease of use from the hook
  };

  return React.createElement(
    NotificationContext.Provider,
    { value: contextValue },
    children,
  );
};

/**
 * Hook to consume the centralized notification state.
 * Must be used within a <NotificationProvider>.
 */
export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error(
      "useNotification must be used within a NotificationProvider",
    );
  }
  return context;
};
