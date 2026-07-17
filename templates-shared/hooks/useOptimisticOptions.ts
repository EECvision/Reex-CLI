import {
  useQueryClient,
  QueryKey,
  UseMutationOptions,
} from "@tanstack/react-query";

export interface OptimisticConfig<
  TData,
  TError,
  TVariables,
  TContext,
> extends Omit<
  UseMutationOptions<TData, TError, TVariables, TContext>,
  "mutationFn"
> {
  queryKey: QueryKey | QueryKey[];
  updater: (oldData: any, variables: TVariables) => any;
}

export function useOptimisticOptions<
  TData = unknown,
  TError = Error,
  TVariables = void,
  TContext = unknown,
>(
  config: OptimisticConfig<TData, TError, TVariables, TContext>,
): Omit<UseMutationOptions<TData, TError, TVariables, TContext>, "mutationFn"> {
  const queryClient = useQueryClient();

  // Ensure keys is a 2D array of QueryKeys to support updating multiple caches at once
  const isArrayOfKeys =
    Array.isArray(config.queryKey) &&
    config.queryKey.length > 0 &&
    Array.isArray(config.queryKey[0]);
  const keys: QueryKey[] = isArrayOfKeys
    ? (config.queryKey as QueryKey[])
    : [config.queryKey as QueryKey];

  return {
    ...config,
    onMutate: async (
      variables: TVariables,
      ...args: any[]
    ): Promise<TContext> => {
      // Cancel any outgoing refetches so they don't overwrite optimistic update
      const cancelPromises = keys.map((key) =>
        queryClient.cancelQueries({ queryKey: key }),
      );
      await Promise.all(cancelPromises);

      // Snapshot the previous values
      const previousData = keys.map((key) => queryClient.getQueryData(key));

      // Optimistically update to the new value
      keys.forEach((key) => {
        queryClient.setQueryData(key, (old: any) =>
          config.updater(old, variables),
        );
      });

      // If user provided an onMutate, run it and merge the context
      let userContext: Partial<TContext> = {};
      if (config.onMutate) {
        const result = await (config.onMutate as any)(variables, ...args);
        if (result) {
          userContext = result as Partial<TContext>;
        }
      }

      // Expose the previousData internally while strictly satisfying TContext externally
      return { previousData, ...userContext } as unknown as TContext;
    },
    onError: (
      err: TError,
      variables: TVariables,
      context?: TContext,
      ...args: any[]
    ) => {
      // Safely cast locally to access our injected snapshot array
      const internalContext = context as
        { previousData?: unknown[] } | undefined;

      // Roll back to the previous value
      if (internalContext?.previousData) {
        keys.forEach((key, index) => {
          queryClient.setQueryData(key, internalContext.previousData![index]);
        });
      }

      // Run user's onError
      if (config.onError) {
        (config.onError as any)(err, variables, context, ...args);
      }
    },
    onSettled: (
      data: TData | undefined,
      error: TError | null,
      variables: TVariables,
      context?: TContext,
      ...args: any[]
    ) => {
      // Always refetch after error or success to ensure truth
      keys.forEach((key) => {
        queryClient.invalidateQueries({ queryKey: key });
      });

      // Run user's onSettled
      if (config.onSettled) {
        (config.onSettled as any)(data, error, variables, context, ...args);
      }
    },
  };
}
