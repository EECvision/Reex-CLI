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
