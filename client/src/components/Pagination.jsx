export default function Pagination({
  page,
  totalPages,
  onPageChange,
  className = "",
}) {
  if (totalPages <= 1) return null;

  return (
    <div className={`flex items-center justify-between gap-3 ${className}`}>
      <p className="text-xs text-slate-600">
        Page <span className="font-medium text-slate-900">{page}</span> of{" "}
        <span className="font-medium text-slate-900">{totalPages}</span>
      </p>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          className={[
            "rounded-lg border px-3 py-1.5 text-xs font-semibold transition",
            page <= 1
              ? "cursor-not-allowed border-slate-200 text-slate-400"
              : "border-slate-200 text-slate-700 hover:bg-slate-50",
          ].join(" ")}
        >
          Prev
        </button>
        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className={[
            "rounded-lg border px-3 py-1.5 text-xs font-semibold transition",
            page >= totalPages
              ? "cursor-not-allowed border-slate-200 text-slate-400"
              : "border-slate-200 text-slate-700 hover:bg-slate-50",
          ].join(" ")}
        >
          Next
        </button>
      </div>
    </div>
  );
}
