// @internal — No changes needed
"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { AuthProvider } from "../auth-methods/AuthProvider";
import type { AuthStrategy } from "../auth-methods/manager";
import AppNotification from "../custom/notification/AppNotification/AppNotification";
import { NotificationProvider } from "./NotificationProvider";

export function ReexProvider({
  children,
  strategy,
}: {
  children: ReactNode;
  strategy: AuthStrategy;
}) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <NotificationProvider>
        <AuthProvider strategy={strategy}>{children}</AuthProvider>
        <AppNotification />
      </NotificationProvider>
    </QueryClientProvider>
  );
}
