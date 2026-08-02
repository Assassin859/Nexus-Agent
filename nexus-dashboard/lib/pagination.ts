export const DEFAULT_PAGE_SIZE = 10;

export function getTotalPages(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

export function paginateSlice<T>(items: T[], page: number, pageSize: number): T[] {
  const totalPages = getTotalPages(items.length, pageSize);
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

export function pageRangeLabel(page: number, pageSize: number, total: number): string {
  if (total === 0) return "0 items";
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  return `${start}–${end} of ${total}`;
}
