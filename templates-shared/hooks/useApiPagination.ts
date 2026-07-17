import React, { useState, useCallback, useEffect } from "react";

export interface PaginationOptions<TItem, TData> {
  limit?: number;
  extractItems?: (data: TData) => TItem[];
  extractTotal?: (data: TData) => number;
  keyExtractor?: (item: TItem) => string | number;
}

interface QueryResult<TData> {
  data?: TData;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  error: Error | null;
  refetch?: () => void;
}

function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === "object" && val !== null && !Array.isArray(val);
}

function extractDefaultItems<TItem>(data: unknown): TItem[] {
  if (!isRecord(data)) return [];
  if (isRecord(data.data) && Array.isArray(data.data.items)) {
    return data.data.items as TItem[];
  }
  if (Array.isArray(data.items)) {
    return data.items as TItem[];
  }
  return [];
}

function extractDefaultTotal(data: unknown): number {
  if (!isRecord(data)) return 0;
  if (
    isRecord(data.data) &&
    isRecord(data.data.meta) &&
    typeof data.data.meta.totalItems === "number"
  ) {
    return data.data.meta.totalItems;
  }
  if (isRecord(data.meta) && typeof data.meta.totalItems === "number") {
    return data.meta.totalItems;
  }
  return 0;
}

export function useApiPagination<TItem, TData, TParams>(
  useQueryHook: (params: TParams, options?: unknown) => QueryResult<TData>,
  baseParams: Omit<TParams, "page" | "limit">,
  options: PaginationOptions<TItem, TData> = {},
) {
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<TItem[]>([]);

  // Store options in a ref to prevent infinite loops from inline functions
  const optionsRef = React.useRef(options);
  optionsRef.current = options;

  const limit = options.limit || 10;

  // Explicitly cast the merged object
  const queryParams = { ...baseParams, page, limit } as unknown as TParams;

  const queryResult = useQueryHook(queryParams);

  useEffect(() => {
    if (queryResult.data) {
      const currentOptions = optionsRef.current;
      const newItems = currentOptions.extractItems
        ? currentOptions.extractItems(queryResult.data)
        : extractDefaultItems<TItem>(queryResult.data);

      setItems((prev) => {
        if (page === 1) return newItems;

        // Merge unique items or just append if they lack identifiers
        const existingIds = new Set(
          prev
            .map((i) => {
              if (currentOptions.keyExtractor)
                return currentOptions.keyExtractor(i);
              return isRecord(i) ? (i.id ?? i._id) : undefined;
            })
            .filter((id) => id !== undefined && id !== null),
        );

        const uniqueNewItems = newItems.filter((i) => {
          let id: unknown;
          if (currentOptions.keyExtractor) {
            id = currentOptions.keyExtractor(i);
          } else {
            id = isRecord(i) ? (i.id ?? i._id) : undefined;
          }
          return id !== undefined && id !== null ? !existingIds.has(id) : true;
        });

        return [...prev, ...uniqueNewItems];
      });
    }
  }, [queryResult.data, page]);

  const total = options.extractTotal
    ? options.extractTotal(queryResult.data as TData)
    : extractDefaultTotal(queryResult.data);

  function newItemsLength(
    data: TData | undefined,
    extractor?: (d: TData) => TItem[],
  ) {
    if (!data) return 0;
    if (extractor) return extractor(data).length;
    return extractDefaultItems<TItem>(data).length;
  }

  const hasNextPage =
    items.length < total ||
    newItemsLength(queryResult.data, options.extractItems) === limit;

  const nextPage = useCallback(() => {
    if (!queryResult.isFetching && hasNextPage) {
      setPage((p) => p + 1);
    }
  }, [queryResult.isFetching, hasNextPage]);

  const refresh = useCallback(() => {
    setPage(1);
    queryResult.refetch?.();
  }, [queryResult]);

  return {
    data: items,
    page,
    limit,
    nextPage,
    refresh,
    isFetching: queryResult.isLoading || (queryResult.isFetching && page === 1),
    isFetchingNextPage: queryResult.isFetching && page > 1,
    hasNextPage,
    total,
    error: queryResult.error,
    isError: queryResult.isError,
  };
}
