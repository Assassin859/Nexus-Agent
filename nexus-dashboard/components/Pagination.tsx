"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { pageRangeLabel } from "@/lib/pagination";

type PaginationProps = {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  className?: string;
};

export default function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  onPageChange,
  className,
}: PaginationProps) {
  if (total <= pageSize) return null;

  return (
    <div
      className={className}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 12,
        padding: "4px 0 12px",
      }}
    >
      <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 500 }}>
        {pageRangeLabel(page, pageSize, total)}
      </span>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page === 1}
          className="btn"
          style={{
            padding: "6px 14px",
            fontSize: 13,
            display: "flex",
            alignItems: "center",
            gap: 4,
            opacity: page === 1 ? 0.5 : 1,
            cursor: page === 1 ? "not-allowed" : "pointer",
          }}
          aria-label="Previous page"
        >
          <ChevronLeft size={16} /> Previous
        </button>
        <span style={{ fontSize: 13, color: "var(--text-muted)", fontWeight: 600, minWidth: 88, textAlign: "center" }}>
          Page {page} / {totalPages}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page === totalPages}
          className="btn"
          style={{
            padding: "6px 14px",
            fontSize: 13,
            display: "flex",
            alignItems: "center",
            gap: 4,
            opacity: page === totalPages ? 0.5 : 1,
            cursor: page === totalPages ? "not-allowed" : "pointer",
          }}
          aria-label="Next page"
        >
          Next <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
