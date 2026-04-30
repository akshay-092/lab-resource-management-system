import Pagination from "./Pagination.jsx";
import { normalize } from "../utils/common.js";

export default function DataTable({
  title,
  subtitle,
  columns,
  rows,
  searchValue,
  onSearchChange,
  searchPlaceholder = "Search...",
  page,
  pageSize,
  onPageChange,
  totalPages,
  isLoading,
  actions,
}) {
  const computedTotalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const effectiveTotalPages = totalPages || computedTotalPages;
  const safePage = Math.min(page, effectiveTotalPages);

  const startIndex = (safePage - 1) * pageSize;
  const pageRows = totalPages ? rows : rows.slice(startIndex, startIndex + pageSize);

  return (
    <section className="rounded-2xl bg-white shadow-lg ring-1 ring-black/5 overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-slate-200 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold text-slate-900">
            {title}
          </h2>
          {subtitle ? (
            <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
          ) : null}
        </div>

        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <input
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-300 focus:ring-2 focus:ring-slate-100 sm:w-80"
          />
          {actions ? <div className="sm:ml-2">{actions}</div> : null}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
            <tr>
              {columns.map((col) => (
                <th key={col.key} className="px-6 py-3">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? (
              <tr>
                <td className="px-6 py-6 text-slate-600" colSpan={columns.length}>
                  Loading…
                </td>
              </tr>
            ) : pageRows.length === 0 ? (
              <tr>
                <td className="px-6 py-6 text-slate-600" colSpan={columns.length}>
                  No results.
                </td>
              </tr>
            ) : (
              pageRows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50/70">
                  {columns.map((col) => (
                    <td key={col.key} className="px-6 py-3 align-top">
                      {col.render ? col.render(row) : row[col.key]}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="border-t border-slate-200 px-6 py-4">
        <Pagination
          page={safePage}
          totalPages={effectiveTotalPages}
          onPageChange={onPageChange}
        />
      </div>
    </section>
  );
}
