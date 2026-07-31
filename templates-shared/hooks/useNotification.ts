import { useContext } from "react";
import { NotificationContext } from "./notification";

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
