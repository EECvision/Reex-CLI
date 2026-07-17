import { useState, useEffect, useRef } from "react";

// Utility types for inference
type ExtractParams<T> = T extends (params: infer P, options?: any) => any
  ? P
  : never;
type ExtractOptions<T> = T extends (params: any, options?: infer O) => any
  ? O
  : never;

// Lightweight deep equality check to avoid JSON.stringify overhead and property order issues
function isDeepEqual(obj1: any, obj2: any): boolean {
  if (obj1 === obj2) return true;

  if (
    typeof obj1 !== "object" ||
    obj1 === null ||
    typeof obj2 !== "object" ||
    obj2 === null
  ) {
    return false;
  }

  if (Array.isArray(obj1) !== Array.isArray(obj2)) return false;

  if (Array.isArray(obj1) && Array.isArray(obj2)) {
    if (obj1.length !== obj2.length) return false;
    for (let i = 0; i < obj1.length; i++) {
      if (!isDeepEqual(obj1[i], obj2[i])) return false;
    }
    return true;
  }

  if (obj1 instanceof Date && obj2 instanceof Date) {
    return obj1.getTime() === obj2.getTime();
  } else if (obj1 instanceof Date || obj2 instanceof Date) {
    return false;
  }

  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);

  if (keys1.length !== keys2.length) return false;

  for (const key of keys1) {
    if (!keys2.includes(key) || !isDeepEqual(obj1[key], obj2[key])) {
      return false;
    }
  }

  return true;
}

function useDeepCompareMemoize<T>(value: T): T {
  const ref = useRef<T>(value);
  if (!isDeepEqual(value, ref.current)) {
    ref.current = value;
  }
  return ref.current;
}

export function useDebouncedSearch<
  TQueryHook extends (params: any, options?: any) => any,
>(
  useQueryHook: TQueryHook,
  params: ExtractParams<TQueryHook>,
  delay: number = 500,
  queryOptions?: ExtractOptions<TQueryHook>,
): ReturnType<TQueryHook> & { isDebouncing: boolean; isSearching: boolean } {
  const memoizedParams = useDeepCompareMemoize(params);
  const [debouncedParams, setDebouncedParams] =
    useState<ExtractParams<TQueryHook>>(memoizedParams);
  const [isDebouncing, setIsDebouncing] = useState(false);

  useEffect(() => {
    // If the params are exactly the same, ensure debouncing is off and exit
    if (isDeepEqual(memoizedParams, debouncedParams)) {
      setIsDebouncing(false);
      return;
    }

    // Params changed: immediately enter debouncing state
    setIsDebouncing(true);

    const handler = setTimeout(() => {
      setDebouncedParams(memoizedParams);
      setIsDebouncing(false);
    }, delay);

    // Cleanup: Clear timeout if params change before the delay finishes,
    // or if the component unmounts.
    return () => {
      clearTimeout(handler);
    };
  }, [memoizedParams, delay, debouncedParams]);

  // Feed the delayed params into the user's React Query hook
  const queryResult = useQueryHook(debouncedParams, queryOptions);

  const isFetching =
    typeof queryResult === "object" &&
    queryResult !== null &&
    "isFetching" in queryResult
      ? Boolean((queryResult as Record<string, unknown>).isFetching)
      : false;
  const isLoading =
    typeof queryResult === "object" &&
    queryResult !== null &&
    "isLoading" in queryResult
      ? Boolean((queryResult as Record<string, unknown>).isLoading)
      : false;

  return {
    ...queryResult,
    isDebouncing,
    isSearching: Boolean(isDebouncing || isFetching || isLoading),
  };
}
