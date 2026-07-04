import { createApiClient } from "./core";
import { proxyTokenProvider } from "../auth/manager";

/**
 * The globally configured API client instance.
 * It dynamically uses the Active Strategy defined in the AuthProvider.
 */
export const apiClient = createApiClient(proxyTokenProvider);
