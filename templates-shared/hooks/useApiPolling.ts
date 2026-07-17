// Utility types to extract parameters and options from the injected query hook
type ExtractParams<T> = T extends (params: infer P, options?: any) => any
  ? P
  : never;
type ExtractOptions<T> = T extends (params: any, options?: infer O) => any
  ? O
  : never;

export interface PollingOptions<TData, TOptions> {
  interval?: number;
  stopCondition: (data: TData) => boolean;
  queryOptions?: TOptions;
  refetchIntervalInBackground?: boolean;
}

/**
 * A syntactic sugar hook for managing complex React Query polling logic.
 * Automatically halts background refetching once the stopCondition evaluates to true.
 */
export function useApiPolling<
  TQueryHook extends (params: any, options?: any) => any,
>(
  useQueryHook: TQueryHook,
  params: ExtractParams<TQueryHook>,
  options: PollingOptions<
    NonNullable<ReturnType<TQueryHook>["data"]>,
    ExtractOptions<TQueryHook>
  >,
): ReturnType<TQueryHook> {
  const {
    interval = 3000,
    stopCondition,
    queryOptions = {},
    refetchIntervalInBackground,
  } = options;

  return useQueryHook(params, {
    ...(queryOptions as any),
    ...(refetchIntervalInBackground !== undefined && {
      refetchIntervalInBackground,
    }),
    refetchInterval: (query: any) => {
      const data = query?.state?.data;
      // Stop polling instantly if the condition is met
      if (data !== undefined && stopCondition(data)) {
        return false;
      }
      return interval;
    },
  });
}
