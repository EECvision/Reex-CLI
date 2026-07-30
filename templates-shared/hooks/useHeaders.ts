import { useCallback } from "react";
import { getActiveProvider } from "../auth-methods/manager";

/**
 * Hook to manage custom API headers securely.
 */
export const useHeaders = () => {
  const provider = getActiveProvider();

  const getCustomHeaders = useCallback(
    () => provider?.getCustomHeaders?.() ?? {},
    [provider],
  );

  const setCustomHeaders = useCallback(
    (headers: Record<string, string>) => {
      provider?.setCustomHeaders?.(headers);
    },
    [provider],
  );

  const removeCustomHeader = useCallback(
    (key: string) => {
      provider?.removeCustomHeader?.(key);
    },
    [provider],
  );

  return { getCustomHeaders, setCustomHeaders, removeCustomHeader };
};
