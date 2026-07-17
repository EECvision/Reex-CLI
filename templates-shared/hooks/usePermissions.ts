import { useState, useEffect } from "react";
import { getActiveProvider } from "../auth-methods/manager";
import { useIsAuthenticated } from "./useAuth";

interface PermissionsState {
  roles: string[];
  permissions: string[];
}

let cachedToken: string | null = null;
let cachedPermissions: PermissionsState | null = null;
let activeParsePromise: Promise<PermissionsState> | null = null;

const fetchAndDecodeToken = async (
  provider: any,
): Promise<PermissionsState> => {
  try {
    const token = await provider.getToken();
    if (!token) {
      return { roles: [], permissions: [] };
    }

    if (token === cachedToken && cachedPermissions) {
      return cachedPermissions;
    }

    // Split JWT into [header, payload, signature]
    const parts = token.split(".");
    if (parts.length !== 3) return { roles: [], permissions: [] }; // Not a valid JWT

    // Decode base64 payload (handles URL-safe base64 padding as well)
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");

    // Native decode using atob (lightweight, no external dependencies required)
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join(""),
    );
    const payload = JSON.parse(jsonPayload);

    // Dynamically extract roles. Backends use various keys: 'roles', 'role', or 'realm_access.roles'
    let roles: string[] = [];
    if (Array.isArray(payload.roles)) roles = payload.roles;
    else if (typeof payload.role === "string") roles = [payload.role];
    else if (Array.isArray(payload.role)) roles = payload.role;

    // Dynamically extract permissions/scopes
    let permissions: string[] = [];
    if (Array.isArray(payload.permissions)) permissions = payload.permissions;
    else if (Array.isArray(payload.scopes)) permissions = payload.scopes;
    else if (typeof payload.scope === "string")
      permissions = payload.scope.split(" ");

    cachedToken = token;
    cachedPermissions = { roles, permissions };

    return cachedPermissions;
  } catch (err) {
    console.warn("[usePermissions] Failed to decode active JWT token");
    return { roles: [], permissions: [] };
  }
};

const getSharedPermissions = (provider: any): Promise<PermissionsState> => {
  if (!activeParsePromise) {
    activeParsePromise = fetchAndDecodeToken(provider).finally(() => {
      activeParsePromise = null;
    });
  }
  return activeParsePromise;
};

export function usePermissions() {
  const { isAuthenticated, isLoading } = useIsAuthenticated();

  // If we already have cached permissions, initialize synchronously to avoid flicker
  const [state, setState] = useState<PermissionsState>(
    cachedPermissions || { roles: [], permissions: [] },
  );

  useEffect(() => {
    const parseToken = async () => {
      const provider = getActiveProvider();
      if (!provider || !provider.getToken) return;

      const result = await getSharedPermissions(provider);
      setState(result);
    };

    if (isAuthenticated) {
      parseToken();
    } else if (!isLoading) {
      // Instantly clear state and global cache if user logs out
      cachedToken = null;
      cachedPermissions = null;
      setState({ roles: [], permissions: [] });
    }
  }, [isAuthenticated, isLoading]);

  /** Checks if the user holds a specific role claim */
  const hasRole = (role: string) => state.roles.includes(role);

  /** Checks if the user holds a specific permission/scope claim */
  const can = (permission: string) => state.permissions.includes(permission);

  return {
    hasRole,
    can,
    roles: state.roles,
    permissions: state.permissions,
    isParsing: isLoading || (!cachedPermissions && isAuthenticated),
  };
}
