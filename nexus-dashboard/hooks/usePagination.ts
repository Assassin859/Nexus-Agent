"use client";

import { useEffect, useMemo, useState } from "react";
import { DEFAULT_PAGE_SIZE, getTotalPages, paginateSlice } from "@/lib/pagination";

type UsePaginationOptions = {
  /** Jump to last page when item count grows (e.g. chat). */
  stickToEnd?: boolean;
};

export function usePagination<T>(
  items: T[],
  pageSize: number = DEFAULT_PAGE_SIZE,
  resetDeps: unknown[] = [],
  options?: UsePaginationOptions,
) {
  const [page, setPage] = useState(1);
  const total = items.length;
  const totalPages = getTotalPages(total, pageSize);

  useEffect(() => {
    if (options?.stickToEnd && total > 0) {
      setPage(getTotalPages(total, pageSize));
      return;
    }
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...resetDeps, options?.stickToEnd ? total : null]);

  const safePage = Math.min(page, totalPages);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const pagedItems = useMemo(
    () => paginateSlice(items, safePage, pageSize),
    [items, safePage, pageSize],
  );

  return {
    page: safePage,
    setPage,
    totalPages,
    pagedItems,
    total,
    pageSize,
    showPagination: total > pageSize,
  };
}
