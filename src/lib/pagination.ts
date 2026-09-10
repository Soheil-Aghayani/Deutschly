export interface PaginationState {
  totalPages: number;
  page: number;
  firstItem: number;
  lastItem: number;
}

export function getPaginationState(page: number, pageSize: number, totalItems: number): PaginationState {
  const safePageSize = Math.max(1, Math.floor(pageSize));
  const safeTotalItems = Math.max(0, Math.floor(totalItems));
  if (safeTotalItems === 0) return { totalPages: 0, page: 1, firstItem: 0, lastItem: 0 };

  const totalPages = Math.max(1, Math.ceil(safeTotalItems / safePageSize));
  const safePage = Math.min(Math.max(1, Math.floor(page)), totalPages);
  return {
    totalPages,
    page: safePage,
    firstItem: (safePage - 1) * safePageSize + 1,
    lastItem: Math.min(safePage * safePageSize, safeTotalItems),
  };
}

export function getPageSlice<T>(items: readonly T[], page: number, pageSize: number): T[] {
  const safePageSize = Math.max(1, Math.floor(pageSize));
  const safePage = getPaginationState(page, safePageSize, items.length).page;
  return items.slice((safePage - 1) * safePageSize, safePage * safePageSize);
}
