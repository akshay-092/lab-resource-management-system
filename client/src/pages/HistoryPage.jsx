import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";
import DataTable from "../components/DataTable.jsx";
import Modal from "../components/Modal.jsx";
import ConfirmModal from "../components/ConfirmModal.jsx";
import { axiosInstance } from "../utils/axiosInstance.js";
import useDebouncedValue from "../hooks/useDebouncedValue.js";
import { formatDate } from "../utils/common.js";
import { DEFAULT_PAGE_SIZE } from "../utils/constants.js";


/**
 * Displays a colorful pill badge based on the status of a booking.
 */
function StatusBadge({ status }) {
  const styles = {
    PENDING: "bg-amber-100 text-amber-700",
    APPROVED: "bg-emerald-100 text-emerald-700",
    REJECTED: "bg-rose-100 text-rose-700",
    CANCELLED: "bg-slate-100 text-slate-700",
  }[status] || "bg-slate-100 text-slate-700";

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${styles}`}>
      {status}
    </span>
  );
}

/**
 * Shows the name and type of the resource in the history table.
 */
function ResourceDetails({ row }) {
  const name = row.resourceType === "INSTRUMENT" ? row.instrument?.name : row.material?.name;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-medium text-slate-900">{name || " "}</span>
      <span className="text-[11px] font-medium uppercase text-slate-500">
        {row.resourceType} {row.isExtension && "• Extension"}
      </span>
    </div>
  );
}

/**
 * The main page component that displays the user's past and current bookings.
 */
export default function HistoryPage() {
  const [bookings, setBookings] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);

  const [extendTarget, setExtendTarget] = useState(null);
  const [newEndTime, setNewEndTime] = useState("");
  const [extraQuantity, setExtraQuantity] = useState(1);
  const [isExtending, setIsExtending] = useState(false);
  const [cancelTargetId, setCancelTargetId] = useState(null);

  const abortRef = useRef(null);

  /**
   * Fetches the user's booking history from the backend API.
   */
  const fetchHistory = useCallback(async (pg) => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    setIsLoading(true);
    try {
      const { data } = await axiosInstance.post(
        "/bookings/list",
        { page: pg, limit: DEFAULT_PAGE_SIZE, search: debouncedSearch },
        { signal: abortRef.current.signal }
      );
      setBookings(data.bookings || []);
      setTotalPages(data.totalPages || 1);
      setTotalCount(data.totalCount || 0);
    } catch (err) {
      if (err?.code === "ERR_CANCELED") return;
      toast.error(err?.response?.data?.message || "Failed to load history.");
    } finally {
      setIsLoading(false);
    }
  }, [debouncedSearch]);

  useEffect(() => {
    fetchHistory(page);
  }, [page, fetchHistory]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  /**
   * Sends a request to cancel the selected booking.
   */
  const submitCancel = async () => {
    if (!cancelTargetId) return;
    try {
      const { data } = await axiosInstance.post("/bookings/cancel", { bookingId: cancelTargetId });
      toast.success(data.message || "Booking cancelled.");
      fetchHistory(page);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to cancel booking.");
    } finally {
      setCancelTargetId(null);
    }
  };

  /**
   * Handles submitting an extension request for more time or quantity.
   */
  const handleExtend = async (e) => {
    e.preventDefault();
    if (!extendTarget) return;

    // Validates that the extension request is logical.
    // - Instruments: checks that the new end time is in the future.
    // - Materials: checks that the extra quantity does not exceed available stock.
    if (extendTarget.resourceType === "INSTRUMENT") {
      const currentEnd = new Date(extendTarget.endTime);
      const newEnd = new Date(newEndTime);
      if (newEnd <= currentEnd) {
        toast.error("New end time must be after current end time.");
        return;
      }
    } else {
      const avail = extendTarget.material?.availableQuantity ?? 0;
      if (extraQuantity <= 0) {
        toast.error("Extra quantity must be greater than 0.");
        return;
      }
      if (extraQuantity > avail) {
        toast.error(`Cannot extend more than available stock (${avail}${extendTarget.material?.unit || ""}).`);
        return;
      }
    }

    setIsExtending(true);
    try {
      const payload = { bookingId: extendTarget._id };
      if (extendTarget.resourceType === "INSTRUMENT") {
        payload.newEndTime = newEndTime;
      } else {
        payload.extraQuantity = extraQuantity;
      }

      const { data } = await axiosInstance.post("/bookings/extend", payload);
      toast.success(data.message || "Extension request submitted.");
      setExtendTarget(null);
      fetchHistory(page);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Extension failed.");
    } finally {
      setIsExtending(false);
    }
  };

  const rows = bookings.map((b) => ({
    ...b,
    id: b._id,
    resourceName: b.resourceType === "INSTRUMENT" ? b.instrument?.name : b.material?.name,
  }));

  const columns = [
    {
      key: "resource",
      label: "Resource",
      render: (row) => <ResourceDetails row={row} />,
    },
    {
      key: "details",
      label: "Details",
      render: (row) => (
        <div className="text-xs text-slate-600">
          {row.resourceType === "INSTRUMENT" ? (
            <>
              {formatDate(row.startTime)} <br /> to {formatDate(row.endTime)}
            </>
          ) : (
            <>Quantity: {row.quantity}</>
          )}
        </div>
      ),
    },
    {
      key: "status",
      label: "Status",
      render: (row) => (
        <div className="flex flex-col gap-1">
          <StatusBadge status={row.status} />
          {row.rejectionReason && (
            <span className="max-w-[150px] text-[10px] text-rose-500 line-clamp-2" title={row.rejectionReason}>
              Reason: {row.rejectionReason}
            </span>
          )}
        </div>
      ),
    },
    {
      key: "createdAt",
      label: "Booked On",
      render: (row) => <span className="text-xs text-slate-500">{formatDate(row.createdAt)}</span>,
    },
    {
      key: "actions",
      label: "Actions",
      render: (row) => (
        <div className="flex items-center gap-2">
          {row.status === "APPROVED" && (
            <button
              onClick={() => {
                setExtendTarget(row);
                setNewEndTime("");
                setExtraQuantity(1);
              }}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
            >
              Extend
            </button>
          )}
          {["APPROVED", "PENDING"].includes(row.status) && (
            <button
              onClick={() => setCancelTargetId(row._id)}
              className="rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 transition"
            >
              Cancel
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-900">My Booking History</h1>
        <p className="mt-1 text-sm text-slate-500">
          Track your resource bookings, manage cancellations, and request extensions.
        </p>
      </div>

      <DataTable
        title="Recent Bookings"
        subtitle={`Showing ${rows.length} of ${totalCount} total bookings`}
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

      <ConfirmModal
        isOpen={Boolean(cancelTargetId)}
        onClose={() => setCancelTargetId(null)}
        onConfirm={submitCancel}
        title="Cancel Booking"
        message="Are you sure you want to cancel this booking? This will release the resource for others."
      />

      <Modal
        isOpen={Boolean(extendTarget)}
        onClose={() => setExtendTarget(null)}
        title={`Extend ${extendTarget?.resourceType === "INSTRUMENT" ? "Time" : "Quantity"}`}
      >
        {extendTarget && (
          <form onSubmit={handleExtend} className="space-y-4">
            <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600 border border-slate-200">
              <p>Resource: <span className="font-semibold text-slate-900">{extendTarget.resourceType === "INSTRUMENT" ? extendTarget.instrument?.name : extendTarget.material?.name}</span></p>
              <p>Current: <span className="font-semibold text-slate-900">{extendTarget.resourceType === "INSTRUMENT" ? formatDate(extendTarget.endTime) : `${extendTarget.quantity} ${extendTarget.material?.unit || "units"}`}</span></p>
              {extendTarget.resourceType === "MATERIAL" && (
                <p>Available: <span className="font-semibold text-emerald-600">{extendTarget.material?.availableQuantity ?? 0} {extendTarget.material?.unit || "units"}</span></p>
              )}
            </div>

            {extendTarget.resourceType === "INSTRUMENT" ? (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">New End Time</label>
                <input
                  type="datetime-local"
                  required
                  min={new Date(extendTarget.endTime || new Date()).toISOString().slice(0, 16)}
                  value={newEndTime}
                  onChange={(e) => setNewEndTime(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-100"
                />
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Extra Quantity ({extendTarget.material?.unit || "units"})
                </label>
                <input
                  type="number"
                  min="1"
                  max={extendTarget.material?.availableQuantity ?? 1}
                  required
                  value={extraQuantity}
                  onChange={(e) => {
                    const val = e.target.value === "" ? "" : parseInt(e.target.value);
                    const avail = extendTarget.material?.availableQuantity ?? 0;
                    if (val !== "" && val > avail) {
                      setExtraQuantity(avail);
                    } else {
                      setExtraQuantity(val);
                    }
                  }}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-100"
                />
                <p className="mt-1 text-[11px] text-slate-500">Max extension: <span className="font-semibold">{extendTarget.material?.availableQuantity ?? 0} {extendTarget.material?.unit || ""}</span></p>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setExtendTarget(null)}
                className="px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 rounded-xl transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isExtending}
                className="px-4 py-2 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition disabled:opacity-50"
              >
                {isExtending ? "Submitting..." : "Submit Extension"}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
