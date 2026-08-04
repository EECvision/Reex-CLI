import { useCallback } from "react";
import { getActiveProvider } from "../auth-methods/manager";

/**
 * Hook to manage authentication tokens securely.
 * Note: To log a user out and clear tokens safely, use `clearSession` from `useAuthState` instead.
 */
export const useTokens = () => {
  const provider = getActiveProvider();

  const getToken = useCallback(
    () => provider?.getToken?.() ?? null,
    [provider],
  );

  const setTokens = useCallback(
    (tokens: { accessToken: string; refreshToken?: string }) => {
      provider?.setTokens?.(tokens);
    },
    [provider],
  );

  return { getToken, setTokens };
};
