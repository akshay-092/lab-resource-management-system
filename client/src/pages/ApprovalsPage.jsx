import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-toastify";
import DataTable from "../components/DataTable.jsx";
import Modal from "../components/Modal.jsx";
import { axiosInstance } from "../utils/axiosInstance.js";
import useDebouncedValue from "../hooks/useDebouncedValue.js";
import { formatDate } from "../utils/common.js";
import { DEFAULT_PAGE_SIZE } from "../utils/constants.js";


/**
 * Formats and displays the details of the resource being requested (either an instrument or a material).
 */
function ResourceCell({ row }) {
  if (row.resourceType === "INSTRUMENT") {
    return (
      <div className="flex flex-col gap-0.5">
        <span className="font-medium text-slate-800">
          {row.instrument?.name || " "}
        </span>
        <span className="text-[11px] text-slate-500">
          {formatDate(row.startTime)} → {formatDate(row.endTime)}
        </span>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-medium text-slate-800">
        {row.material?.name || " "}
      </span>
      <span className="text-[11px] text-slate-500">Qty: {row.quantity}</span>
    </div>
  );
}

/**
 * Renders a colored pill to clearly show if the request is for an INSTRUMENT or a MATERIAL.
 */
function TypeBadge({ type }) {
  const styles =
    type === "INSTRUMENT"
      ? "bg-violet-100 text-violet-700"
      : "bg-emerald-100 text-emerald-700";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${styles}`}
    >
      {type}
    </span>
  );
}

/**
 * Renders the Approve and Reject buttons for each pending request in the table.
 */
function ActionButtons({ row, onApprove, onReject, busy }) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={() => onApprove(row)}
        className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
      >
        ✓ Approve
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => onReject(row)}
        className="inline-flex items-center gap-1 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 shadow-sm transition hover:bg-red-50 disabled:opacity-50"
      >
        ✕ Reject
      </button>
    </div>
  );
}

/* columns definition */
/**
 * Builds the column configuration for the data table, defining how each cell should be rendered.
 */
function buildColumns(onApprove, onReject, busy) {
  return [
    {
      key: "requester",
      label: "Requester",
      render: (row) => (
        <div className="flex flex-col gap-0.5">
          <span className="font-medium text-slate-800">
            {row.user?.email || " "}
          </span>
          <span className="text-[11px] uppercase text-slate-400">
            {row.user?.role || ""}
          </span>
        </div>
      ),
    },
    {
      key: "resourceType",
      label: "Type",
      render: (row) => <TypeBadge type={row.resourceType} />,
    },
    {
      key: "resource",
      label: "Resource / Details",
      render: (row) => <ResourceCell row={row} />,
    },
    {
      key: "isExtension",
      label: "Request Kind",
      render: (row) => (
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${row.isExtension
            ? "bg-amber-100 text-amber-700"
            : "bg-blue-100 text-blue-700"
            }`}
        >
          {row.isExtension ? "Extension" : "New Booking"}
        </span>
      ),
    },
    {
      key: "createdAt",
      label: "Requested At",
      render: (row) => (
        <span className="whitespace-nowrap text-slate-600">
          {formatDate(row.createdAt)}
        </span>
      ),
    },
    {
      key: "actions",
      label: "Actions",
      render: (row) => (
        <ActionButtons
          row={row}
          onApprove={onApprove}
          onReject={onReject}
          busy={busy}
        />
      ),
    },
  ];
}

/* main page */
/**
 * The main page component where admins can view, approve, or reject pending booking requests.
 */
export default function ApprovalsPage() {
  const [bookings, setBookings] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);

  // approve modal
  const [approveTarget, setApproveTarget] = useState(null);
  const [approveRemark, setApproveRemark] = useState("");
  const [isApproving, setIsApproving] = useState(false);

  // reject modal
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [isRejecting, setIsRejecting] = useState(false);

  const isBusy = isApproving || isRejecting;
  const abortRef = useRef(null);

  /* fetch */
  /**
   * Fetches the list of pending approval requests from the server.
   */
  const fetchPending = useCallback(async (pg) => {
    // Cancels any ongoing fetch request before starting a new one.
    // Prevents displaying outdated data due to rapid user interactions.
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    setIsLoading(true);
    try {
      const { data } = await axiosInstance.post(
        "/bookings/pending",
        { page: pg, limit: DEFAULT_PAGE_SIZE, search: debouncedSearch },
        { signal: abortRef.current.signal }
      );
      setBookings(data.bookings || []);
      setTotalPages(data.totalPages || 1);
      setTotalCount(data.totalCount || 0);
    } catch (err) {
      if (err?.code === "ERR_CANCELED") return;
      toast.error(
        err?.response?.data?.message || "Failed to load pending approvals."
      );
    } finally {
      setIsLoading(false);
    }
  }, [debouncedSearch]);

  useEffect(() => {
    fetchPending(page);
  }, [page, fetchPending]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  /* handlers */
  /**
   * Opens the approval modal for a specific booking request.
   */
  const handleApproveClick = (row) => {
    setApproveTarget(row);
    setApproveRemark("");
  };

  /**
   * Opens the rejection modal for a specific booking request.
   */
  const handleRejectClick = (row) => {
    setRejectTarget(row);
    setRejectReason("");
  };

  /**
   * Sends the final approval decision to the backend server.
   */
  const submitApprove = async () => {
    if (!approveTarget) return;
    setIsApproving(true);
    try {
      const { data } = await axiosInstance.post("/bookings/approve", {
        bookingId: approveTarget._id,
      });
      toast.success(data.message || "Booking approved.");
      setApproveTarget(null);
      
      // Calculates the correct page to display after the list updates.
      // Moves back one page if the current page becomes empty after approval.
      const nextCount = totalCount - 1;
      const nextTotalPages = Math.max(1, Math.ceil(nextCount / DEFAULT_PAGE_SIZE));
      const nextPage = Math.min(page, nextTotalPages);
      if (nextPage === page) {
        fetchPending(page);
      } else {
        setPage(nextPage);
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to approve booking.");
    } finally {
      setIsApproving(false);
    }
  };

  /**
   * Sends the final rejection decision and the admin's reason to the backend server.
   */
  const submitReject = async () => {
    if (!rejectTarget) return;
    const reason = rejectReason.trim();
    if (!reason) {
      toast.error("Please enter a rejection reason.");
      return;
    }
    setIsRejecting(true);
    try {
      const { data } = await axiosInstance.post("/bookings/reject", {
        bookingId: rejectTarget._id,
        rejectionReason: reason,
      });
      toast.success(data.message || "Booking rejected.");
      setRejectTarget(null);
      const nextCount = totalCount - 1;
      const nextTotalPages = Math.max(1, Math.ceil(nextCount / DEFAULT_PAGE_SIZE));
      const nextPage = Math.min(page, nextTotalPages);
      if (nextPage === page) {
        fetchPending(page);
      } else {
        setPage(nextPage);
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to reject booking.");
    } finally {
      setIsRejecting(false);
    }
  };

  const rows = bookings.map((b) => ({
    ...b,
    id: b._id,
    requester: b.user?.email || "",
    resourceName:
      b.resourceType === "INSTRUMENT"
        ? b.instrument?.name || ""
        : b.material?.name || "",
  }));

  const columns = buildColumns(handleApproveClick, handleRejectClick, isBusy);

  return (
    <>
      {/* page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Pending Approvals</h1>
        <p className="mt-1 text-sm text-slate-500">
          Review and act on booking requests awaiting your decision.
          {!isLoading && (
            <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
              {totalCount} pending
            </span>
          )}
        </p>
      </div>

      <DataTable
        title="Approval Requests"
        subtitle={`Showing ${rows.length} of ${totalCount} pending requests`}
        columns={columns}
        rows={rows}
        searchValue={search}
        searchPlaceholder="Search by resource, purpose, or status..."
        onSearchChange={setSearch}
        page={page}
        pageSize={DEFAULT_PAGE_SIZE}
        onPageChange={setPage}
        totalPages={totalPages}
        isLoading={isLoading}
      />

      {/* Approve Modal */}
      <Modal
        isOpen={Boolean(approveTarget)}
        onClose={() => !isApproving && setApproveTarget(null)}
        title="Approve Booking Request"
      >
        {approveTarget && (
          <div className="flex flex-col gap-4">
            {/* summary card */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                <span className="font-medium text-slate-500">Requester</span>
                <span className="text-slate-800">
                  {approveTarget.user?.email}
                </span>

                <span className="font-medium text-slate-500">Type</span>
                <span className="text-slate-800">
                  {approveTarget.resourceType}
                </span>

                <span className="font-medium text-slate-500">Resource</span>
                <span className="text-slate-800">
                  {approveTarget.resourceType === "INSTRUMENT"
                    ? approveTarget.instrument?.name
                    : approveTarget.material?.name}
                </span>

                {approveTarget.resourceType === "MATERIAL" && (
                  <>
                    <span className="font-medium text-slate-500">Quantity</span>
                    <span className="text-slate-800">
                      {approveTarget.quantity}
                    </span>
                  </>
                )}
                {approveTarget.resourceType === "INSTRUMENT" && (
                  <>
                    <span className="font-medium text-slate-500">Slot</span>
                    <span className="text-slate-800">
                      {formatDate(approveTarget.startTime)} →{" "}
                      {formatDate(approveTarget.endTime)}
                    </span>
                  </>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Remark (optional)
              </label>
              <textarea
                rows={3}
                value={approveRemark}
                onChange={(e) => setApproveRemark(e.target.value)}
                placeholder="Add an internal note if needed…"
                className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
              />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setApproveTarget(null)}
                disabled={isApproving}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitApprove}
                disabled={isApproving}
                className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
              >
                {isApproving ? "Approving…" : "Confirm Approve"}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Reject Modal */}
      <Modal
        isOpen={Boolean(rejectTarget)}
        onClose={() => !isRejecting && setRejectTarget(null)}
        title="Reject Booking Request"
      >
        {rejectTarget && (
          <div className="flex flex-col gap-4">
            {/* summary card */}
            <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm">
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                <span className="font-medium text-slate-500">Requester</span>
                <span className="text-slate-800">
                  {rejectTarget.user?.email}
                </span>

                <span className="font-medium text-slate-500">Type</span>
                <span className="text-slate-800">
                  {rejectTarget.resourceType}
                </span>

                <span className="font-medium text-slate-500">Resource</span>
                <span className="text-slate-800">
                  {rejectTarget.resourceType === "INSTRUMENT"
                    ? rejectTarget.instrument?.name
                    : rejectTarget.material?.name}
                </span>

                {rejectTarget.resourceType === "MATERIAL" && (
                  <>
                    <span className="font-medium text-slate-500">Quantity</span>
                    <span className="text-slate-800">{rejectTarget.quantity}</span>
                  </>
                )}
                {rejectTarget.resourceType === "INSTRUMENT" && (
                  <>
                    <span className="font-medium text-slate-500">Slot</span>
                    <span className="text-slate-800">
                      {formatDate(rejectTarget.startTime)} →{" "}
                      {formatDate(rejectTarget.endTime)}
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* rejection reason (required) */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Rejection Reason{" "}
                <span className="normal-case text-red-500">* required</span>
              </label>
              <textarea
                rows={3}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Explain why this request is being rejected…"
                className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-red-400 focus:ring-2 focus:ring-red-100"
              />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setRejectTarget(null)}
                disabled={isRejecting}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitReject}
                disabled={isRejecting}
                className="rounded-lg bg-red-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:opacity-50"
              >
                {isRejecting ? "Rejecting…" : "Confirm Reject"}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
