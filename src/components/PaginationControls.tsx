import { ArrowLeft, ArrowRight } from "lucide-react";
import { getPaginationState } from "../lib/pagination";

export interface PaginationControlsProps {
  page: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  label?: string;
}

export function PaginationControls({ page, pageSize, totalItems, onPageChange, label = "Pagination" }: PaginationControlsProps) {
  if (totalItems <= 0) return null;

  const { totalPages, page: safePage, firstItem, lastItem } = getPaginationState(page, pageSize, totalItems);

  return (
    <nav className="pagination-controls" aria-label={label}>
      <span className="pagination-controls__count">{firstItem}-{lastItem} of {totalItems}</span>
      {totalPages > 1 && <div className="pagination-controls__nav">
        <button
          type="button"
          className="button button--icon button--ghost"
          onClick={() => onPageChange(safePage - 1)}
          disabled={safePage === 1}
          aria-label="Previous page"
          title="Previous page"
        >
          <ArrowLeft size={16} aria-hidden="true" />
        </button>
        <span className="pagination-controls__page" aria-live="polite">Page {safePage} of {totalPages}</span>
        <button
          type="button"
          className="button button--icon button--ghost"
          onClick={() => onPageChange(safePage + 1)}
          disabled={safePage === totalPages}
          aria-label="Next page"
          title="Next page"
        >
          <ArrowRight size={16} aria-hidden="true" />
        </button>
      </div>}
    </nav>
  );
}
