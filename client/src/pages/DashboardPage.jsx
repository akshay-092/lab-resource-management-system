import { useEffect, useMemo, useState, useRef } from "react";
import { FiChevronDown } from "react-icons/fi";
import { toast } from "react-toastify";

import DataTable from "../components/DataTable.jsx";
import Modal from "../components/Modal.jsx";
import ConfirmModal from "../components/ConfirmModal.jsx";
import { axiosInstance } from "../utils/axiosInstance.js";
import { getUserData, getUserRole } from "../utils/auth.js";
import { FaEye, FaPencilAlt, FaTrash } from "react-icons/fa";
import useDebouncedValue from "../hooks/useDebouncedValue.js";
import { formatDate } from "../utils/common.js";
import { DASHBOARD_PAGE_SIZE, ALLOWED_UNITS, RESOURCE_TYPES } from "../utils/constants.js";

/**
 * Renders a small, colored badge (pill) to visually indicate status (e.g., APPROVED, PENDING).
 */
function Pill({ children, tone = "default" }) {
  const toneClass =
    tone === "yes" || tone === "APPROVED"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
      : tone === "no" || tone === "REJECTED"
        ? "bg-rose-50 text-rose-700 ring-rose-200"
        : tone === "PENDING"
          ? "bg-amber-50 text-amber-700 ring-amber-200"
          : "bg-slate-50 text-slate-700 ring-slate-200";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${toneClass}`}
    >
      {children}
    </span>
  );
}

/**
 * A custom dropdown component used to replace the default browser select menu for better UI.
 */
function CustomSelect({ options, value, onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (ref.current && !ref.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative mt-1" ref={ref}>
      <div
        className="flex w-full cursor-pointer items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition-all hover:border-slate-300 focus-within:border-slate-300 focus-within:ring-2 focus-within:ring-slate-100"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="text-slate-900">{value}</span>
        <FiChevronDown className={`text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </div>
      {isOpen && (
        <div className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-slate-200 bg-white py-1 text-sm shadow-lg">
          {options.map((opt) => (
            <div
              key={opt}
              onClick={() => {
                onChange(opt);
                setIsOpen(false);
              }}
              className={`cursor-pointer px-3 py-2 transition-colors hover:bg-slate-50 ${
                value === opt ? "bg-slate-50 font-medium text-slate-900" : "text-slate-700"
              }`}
            >
              {opt}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Fetches and displays the recent booking history for a specific instrument or material.
 */
function ResourceBookingHistory({ resourceId, resourceType }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function fetchHistory() {
      setLoading(true);
      try {
        const { data } = await axiosInstance.post("/bookings/resource-history", {
          resourceId,
          resourceType,
          limit: 5,
        });
        setHistory(data.bookings || []);
      } catch (err) {
        console.error("Failed to fetch history", err);
      } finally {
        setLoading(false);
      }
    }
    if (resourceId) fetchHistory();
  }, [resourceId, resourceType]);



  return (
    <div className="mt-4 flex flex-col gap-3">
      <h3 className="font-semibold text-slate-700 flex items-center gap-2">
        Booking History
        {loading && <span className="text-[10px] font-normal text-slate-400 animate-pulse">(updating...)</span>}
      </h3>
      {history.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-400">
          No booking records found for this resource.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 divide-y divide-slate-100">
          {history.map((b) => (
            <div key={b._id} className="flex flex-col gap-1 p-3 text-xs bg-white hover:bg-slate-50 transition">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-700">{b.user?.name || b.user?.email || "Anonymous"}</span>
                <Pill tone={b.status}>{b.status}</Pill>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-500">
                {resourceType === RESOURCE_TYPES.INSTRUMENT ? (
                  <span>{formatDate(b.startTime)} - {formatDate(b.endTime)}</span>
                ) : (
                  <span>Quantity: <span className="font-medium text-slate-700">{b.quantity} units</span></span>
                )}
                <span className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-400">
                  {formatDate(b.createdAt)}
                </span>
              </div>
              {b.purpose && (
                <div className="mt-1 text-[11px] text-slate-400 italic">
                  Purpose: {b.purpose}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * A modal window that lets users view instrument details and book a time slot.
 */
function InstrumentViewModal({ item, role, onClose, onBooked }) {
  const [activeTab, setActiveTab] = useState("info");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [purpose, setPurpose] = useState("");
  const [isBooking, setIsBooking] = useState(false);

  const nowStr = new Date().toISOString().slice(0, 16);

  /**
   * Submits the booking request to the server when the user clicks 'Book'.
   */
  async function handleBook(e) {
    e.preventDefault();
    if (!startTime || !endTime) {
      toast.error("Select both start and end times.");
      return;
    }

    const start = new Date(startTime);
    const end = new Date(endTime);
    const now = new Date();

    if (start < now) {
      toast.error("Cannot book in the past.");
      return;
    }

    if (start >= end) {
      toast.error("End time must be after start time.");
      return;
    }

    setIsBooking(true);
    try {
      const { data } = await axiosInstance.post("/bookings/create", {
        resourceType: "INSTRUMENT",
        instrumentId: item.id,
        startTime,
        endTime,
        purpose,
      });
      toast.success(data.message || "Instrument booked successfully.");
      onBooked?.();
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Booking failed.");
    } finally {
      setIsBooking(false);
    }
  }

  return (
    <div className="flex flex-col h-full max-h-[80vh]">
      {/* Tab Headers */}
      <div className="flex border-b border-slate-100 mb-5">
        <button
          onClick={() => setActiveTab("info")}
          className={`px-4 py-2 text-sm font-semibold transition-all border-b-2 ${activeTab === "info"
            ? "border-slate-900 text-slate-900"
            : "border-transparent text-slate-400 hover:text-slate-600"
            }`}
        >
          Details & Booking
        </button>
        <button
          onClick={() => setActiveTab("history")}
          className={`px-4 py-2 text-sm font-semibold transition-all border-b-2 ${activeTab === "history"
            ? "border-slate-900 text-slate-900"
            : "border-transparent text-slate-400 hover:text-slate-600"
            }`}
        >
          History
        </button>
      </div>

      <div className="flex-1 overflow-y-auto pr-1">
        {activeTab === "info" ? (
          <div className="flex flex-col gap-6">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
              <h3 className="mb-2 font-semibold text-slate-700">Instrument Details</h3>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                <span className="font-medium text-slate-500">Name</span><span className="text-slate-800">{item.name}</span>
                <span className="font-medium text-slate-500">Lab</span><span className="text-slate-800">{item.lab || " "}</span>
                <span className="font-medium text-slate-500">Owner</span><span className="text-slate-800">{item.ownerEmail || " "}</span>
                <span className="font-medium text-slate-500">Description</span><span className="text-slate-800">{item.description || " "}</span>
                <span className="font-medium text-slate-500">Requires Approval</span>
                <span><Pill tone={item.requiresApproval ? "yes" : "no"}>{item.requiresApproval ? "Yes" : "No"}</Pill></span>
              </div>
            </div>

            {role === "user" && (
              <form onSubmit={handleBook} className="flex flex-col gap-4">
                <h3 className="font-semibold text-slate-700">Book This Instrument</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Start Time</label>
                    <input
                      type="datetime-local"
                      min={nowStr}
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      required
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">End Time</label>
                    <input
                      type="datetime-local"
                      min={startTime || nowStr}
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      required
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-100"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Purpose of Use</label>
                  <textarea
                    value={purpose}
                    onChange={(e) => setPurpose(e.target.value)}
                    placeholder="e.g. Project X - Sample Analysis"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-100"
                    rows={2}
                  />
                </div>
                {item.requiresApproval && (
                  <p className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
                    ⚠️ This instrument requires admin approval, your booking will be <strong>PENDING</strong>.
                  </p>
                )}
                <div className="flex justify-end gap-2 pt-2">
                  <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
                  <button type="submit" disabled={isBooking} className="rounded-xl bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
                    {isBooking ? "Booking…" : "Confirm Booking"}
                  </button>
                </div>
              </form>
            )}
          </div>
        ) : (
          <ResourceBookingHistory resourceId={item.id} resourceType="INSTRUMENT" />
        )}
      </div>
    </div>
  );
}

/**
 * A modal window that lets users view material details and book a specific quantity.
 */
function MaterialViewModal({ item, role, onClose, onBooked }) {
  const [activeTab, setActiveTab] = useState("info");
  const [quantity, setQuantity] = useState(1);
  const [purpose, setPurpose] = useState("");
  const [isBooking, setIsBooking] = useState(false);

  /**
   * Submits the material booking request to the server when the user clicks 'Book'.
   */
  async function handleBook(e) {
    e.preventDefault();
    const qty = Number(quantity);
    if (!qty || qty <= 0) {
      toast.error("Quantity must be greater than 0.");
      return;
    }
    if (qty > item.availableQuantity) {
      toast.error(`Cannot book more than available quantity (${item.availableQuantity}).`);
      return;
    }

    setIsBooking(true);
    try {
      const { data } = await axiosInstance.post("/bookings/create", {
        resourceType: "MATERIAL",
        materialId: item.id,
        quantity: qty,
        purpose,
      });
      toast.success(data.message || "Material booked successfully.");
      onBooked?.();
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Booking failed.");
    } finally {
      setIsBooking(false);
    }
  }

  return (
    <div className="flex flex-col h-full max-h-[80vh]">
      {/* Tab Headers */}
      <div className="flex border-b border-slate-100 mb-5">
        <button
          onClick={() => setActiveTab("info")}
          className={`px-4 py-2 text-sm font-semibold transition-all border-b-2 ${activeTab === "info"
            ? "border-slate-900 text-slate-900"
            : "border-transparent text-slate-400 hover:text-slate-600"
            }`}
        >
          Details & Booking
        </button>
        <button
          onClick={() => setActiveTab("history")}
          className={`px-4 py-2 text-sm font-semibold transition-all border-b-2 ${activeTab === "history"
            ? "border-slate-900 text-slate-900"
            : "border-transparent text-slate-400 hover:text-slate-600"
            }`}
        >
          History
        </button>
      </div>

      <div className="flex-1 overflow-y-auto pr-1">
        {activeTab === "info" ? (
          <div className="flex flex-col gap-6">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
              <h3 className="mb-2 font-semibold text-slate-700">Material Details</h3>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                <span className="font-medium text-slate-500">Name</span><span className="text-slate-800">{item.name}</span>
                <span className="font-medium text-slate-500">Unit</span><span className="text-slate-800">{item.unit || " "}</span>
                <span className="font-medium text-slate-500">Total</span><span className="text-slate-800">{item.totalQuantity}</span>
                <span className="font-medium text-slate-500">Available</span><span className="font-semibold text-emerald-700">{item.availableQuantity}</span>
                <span className="font-medium text-slate-500">Reserved</span><span className="text-slate-800">{item.reservedQuantity}</span>
                <span className="font-medium text-slate-500">Owner</span><span className="text-slate-800">{item.ownerEmail || " "}</span>
                <span className="font-medium text-slate-500">Description</span><span className="text-slate-800">{item.description || " "}</span>
                <span className="font-medium text-slate-500">Requires Approval</span>
                <span><Pill tone={item.requiresApproval ? "yes" : "no"}>{item.requiresApproval ? "Yes" : "No"}</Pill></span>
              </div>
            </div>

            {role === "user" && (
              <form onSubmit={handleBook} className="flex flex-col gap-4">
                <h3 className="font-semibold text-slate-700">Book This Material</h3>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
                    Quantity ({item.unit || "units"})
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={item.availableQuantity}
                    value={quantity}
                    onChange={(e) => {
                      const val = e.target.value === "" ? "" : Number(e.target.value);
                      if (val !== "" && val > item.availableQuantity) {
                        setQuantity(item.availableQuantity);
                      } else {
                        setQuantity(val);
                      }
                    }}
                    required
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-100"
                  />
                  <p className="mt-1 text-xs text-slate-500">Max available: <span className="font-semibold text-emerald-600">{item.availableQuantity} {item.unit}</span></p>
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Purpose of Use</label>
                  <textarea
                    value={purpose}
                    onChange={(e) => setPurpose(e.target.value)}
                    placeholder="e.g. Chemical synthesis for study Y"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-100"
                    rows={2}
                  />
                </div>
                {item.requiresApproval && (
                  <p className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
                    ⚠️ This material requires admin approval, your booking will be <strong>PENDING</strong>.
                  </p>
                )}
                <div className="flex justify-end gap-2 pt-2">
                  <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
                  <button type="submit" disabled={isBooking || item.availableQuantity <= 0}
                    className="rounded-xl bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
                    {isBooking ? "Booking…" : item.availableQuantity <= 0 ? "Out of Stock" : "Confirm Booking"}
                  </button>
                </div>
              </form>
            )}
          </div>
        ) : (
          <ResourceBookingHistory resourceId={item.id} resourceType="MATERIAL" />
        )}
      </div>
    </div>
  );
}

/**
 * The section of the dashboard that displays and manages all instruments.
 */
function InstrumentsSection() {
  const role = getUserRole();
  const userData = useMemo(() => getUserData(), []);

  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const debouncedSearch = useDebouncedValue(search, 300);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    name: "",
    description: "",
    lab: "",
    requiresApproval: false,
  });

  const [viewItem, setViewItem] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  /**
   * Fetches the list of instruments from the server to display in the table.
   */
  async function fetchList() {
    try {
      setIsLoading(true);
      const res = await axiosInstance.post("/instruments/list", {
        page,
        pageSize: DASHBOARD_PAGE_SIZE,
        search: debouncedSearch,
      });
      const instruments = res?.data?.instruments || [];
      setTotalPages(res?.data?.pagination?.totalPages || 1);
      // Maps raw database data into a clean object format for the UI.
      setItems(
        instruments.map((i) => ({
          id: i._id,
          name: i.name,
          description: i.description,
          lab: i.lab,
          requiresApproval: Boolean(i.requiresApproval),
          ownerId: i.owner?._id || "",
          ownerEmail: i.owner?.email || "",
        }))
      );
    } catch (e) {
      toast.error(e?.response?.data?.message || "Failed to load instruments.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    fetchList();
  }, [page, debouncedSearch]);

  /**
   * Opens the modal to create a new instrument with an empty form.
   */
  function openCreate() {
    setEditing(null);
    setForm({
      name: "",
      description: "",
      lab: "",
      requiresApproval: false,
    });
    setIsModalOpen(true);
  }

  /**
   * Opens the modal to edit an existing instrument, pre-filling the form with its data.
   */
  function openEdit(item) {
    setEditing(item);
    setForm({
      name: item.name || "",
      description: item.description || "",
      lab: item.lab || "",
      requiresApproval: Boolean(item.requiresApproval),
    });
    setIsModalOpen(true);
  }

  /**
   * Saves the instrument data to the server (either creating a new one or updating an existing one).
   */
  async function handleSave(event) {
    event.preventDefault();

    if (!form.name.trim() || !form.lab.trim()) {
      toast.error("Name and lab are required.");
      return;
    }

    try {
      if (editing) {
        // Sends an update request for the existing instrument.
        await axiosInstance.post("/instruments/update", {
          id: editing.id,
          name: form.name,
          description: form.description,
          lab: form.lab,
          requiresApproval: form.requiresApproval,
        });
        toast.success("Instrument updated.");
      } else {
        // Creates a new instrument record in the database.
        if (!userData?.id) {
          toast.error("Missing user id in local storage.");
          return;
        }
        await axiosInstance.post("/instruments/create", {
          name: form.name,
          description: form.description,
          lab: form.lab,
          owner: userData.id,
          requiresApproval: form.requiresApproval,
        });
        toast.success("Instrument created.");
      }

      setIsModalOpen(false);
      await fetchList();
    } catch (e) {
      toast.error(e?.response?.data?.message || "Save failed.");
    }
  }

  /**
   * Sends a request to the server to delete the currently selected instrument.
   */
  async function submitDelete() {
    if (!deleteTarget) return;
    try {
      await axiosInstance.post("/instruments/delete", { id: deleteTarget.id });
      toast.success("Instrument deleted.");
      await fetchList();
    } catch (e) {
      toast.error(e?.response?.data?.message || "Delete failed.");
    } finally {
      setDeleteTarget(null);
    }
  }

  const columns = [
    { key: "name", label: "Name" },
    { key: "lab", label: "Lab" },
    {
      key: "requiresApproval",
      label: "Approval Required",
      render: (row) => (
        <Pill tone={row.requiresApproval ? "yes" : "no"}>
          {row.requiresApproval ? "Required" : "No"}
        </Pill>
      ),
    },
    { key: "ownerEmail", label: "Owner" },
    {
      key: "actions",
      label: "Actions",
      render: (row) => (
        <div className="flex items-center gap-2">
          <button
            type="button"
            title="View"
            className="inline-flex items-center justify-center rounded-lg border border-slate-200 p-2 text-slate-700 hover:bg-slate-50"
            onClick={() => setViewItem(row)}
          >
            <FaEye className="h-4 w-4" />
          </button>
          {role === "admin" && (
            <>
              <button
                type="button"
                title="Edit"
                className="inline-flex items-center justify-center rounded-lg border border-slate-200 p-2 text-slate-700 hover:bg-slate-50"
                onClick={() => openEdit(row)}
              >
                <FaPencilAlt className="h-4 w-4" />
              </button>
              <button
                type="button"
                title="Delete"
                className="inline-flex items-center justify-center rounded-lg border border-rose-200 bg-rose-50 p-2 text-rose-700 hover:bg-rose-100"
                onClick={() => setDeleteTarget(row)}
              >
                <FaTrash className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <DataTable
        title="Instruments"
        subtitle="All lab instruments"
        columns={columns}
        rows={items}
        searchValue={search}
        searchPlaceholder="Search by name, lab, or description..."
        onSearchChange={(v) => {
          setSearch(v);
          setPage(1);
        }}
        page={page}
        pageSize={DASHBOARD_PAGE_SIZE}
        onPageChange={setPage}
        totalPages={totalPages}
        isLoading={isLoading}
        actions={
          role === "admin" ? (
            <button
              type="button"
              onClick={openCreate}
              className="w-full rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 sm:w-auto"
            >
              Add Instrument
            </button>
          ) : null
        }
      />

      <ConfirmModal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={submitDelete}
        title="Delete Instrument"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? This action cannot be undone.`}
      />

      <Modal
        title={editing ? "Edit Instrument" : "Add Instrument"}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      >
        <form className="space-y-4" onSubmit={handleSave}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-1">
              <label className="block text-sm font-medium text-slate-700">
                Name <span className="text-red-500 ml-1">*</span>
              </label>
              <input
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-100"
              />
            </div>
            <div className="sm:col-span-1">
              <label className="block text-sm font-medium text-slate-700">
                Lab <span className="text-red-500 ml-1">*</span>
              </label>
              <input
                value={form.lab}
                onChange={(e) => setForm((p) => ({ ...p, lab: e.target.value }))}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-100"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">
              Description
            </label>
            <textarea
              value={form.description}
              onChange={(e) =>
                setForm((p) => ({ ...p, description: e.target.value }))
              }
              rows={3}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-100"
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.requiresApproval}
              onChange={(e) =>
                setForm((p) => ({ ...p, requiresApproval: e.target.checked }))
              }
              className="h-4 w-4 rounded border-slate-300"
            />
            Requires approval
          </label>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Save
            </button>
          </div>
        </form>
      </Modal>

      {/* View / Book Modal */}
      <Modal title="Instrument Info" isOpen={Boolean(viewItem)} onClose={() => setViewItem(null)}>
        {viewItem && (
          <InstrumentViewModal item={viewItem} role={role} onClose={() => setViewItem(null)} onBooked={fetchList} />
        )}
      </Modal>
    </>
  );
}

/**
 * The section of the dashboard that displays and manages all materials.
 */
function MaterialsSection() {
  const role = getUserRole();

  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const debouncedSearch = useDebouncedValue(search, 300);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    name: "",
    description: "",
    unit: "units",
    totalQuantity: 0,
    requiresApproval: false,
  });

  const [viewItem, setViewItem] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  async function fetchList() {
    try {
      setIsLoading(true);
      const res = await axiosInstance.post("/materials/list", {
        page,
        pageSize: DASHBOARD_PAGE_SIZE,
        search: debouncedSearch,
      });
      const materials = res?.data?.materials || [];
      setTotalPages(res?.data?.pagination?.totalPages || 1);
      setItems(
        materials.map((m) => ({
          id: m._id,
          name: m.name,
          description: m.description,
          unit: m.unit || "units",
          totalQuantity: m.totalQuantity,
          availableQuantity: m.availableQuantity,
          reservedQuantity: m.reservedQuantity,
          requiresApproval: Boolean(m.requiresApproval),
          ownerEmail: m.owner?.email || "",
        }))
      );
    } catch (e) {
      toast.error(e?.response?.data?.message || "Failed to load materials.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    fetchList();
  }, [page, debouncedSearch]);

  function openCreate() {
    setEditing(null);
    setForm({
      name: "",
      description: "",
      unit: "units",
      totalQuantity: 0,
      requiresApproval: false,
    });
    setIsModalOpen(true);
  }

  function openEdit(item) {
    setEditing(item);
    setForm({
      name: item.name || "",
      description: item.description || "",
      unit: item.unit || "units",
      totalQuantity: item.totalQuantity ?? 0,
      requiresApproval: Boolean(item.requiresApproval),
    });
    setIsModalOpen(true);
  }

  /**
   * Validates the material form data before submitting it to the server.
   * @param {Object} nextForm - The form data to validate.
   * @returns {boolean} True if the form is valid, false otherwise.
   */
  function validateMaterialForm(nextForm) {
    const total = Number(nextForm.totalQuantity);

    if (!nextForm.name.trim()) return "Name is required.";
    if (!ALLOWED_UNITS.includes(nextForm.unit))
      return `Unit must be one of: ${ALLOWED_UNITS.join(", ")}`;
    if (!Number.isFinite(total)) return "Total quantity must be a number.";
    if (total < 0) return "Total quantity cannot be negative.";
    return "";
  }

  async function handleSave(event) {
    event.preventDefault();

    const errorMessage = validateMaterialForm(form);
    if (errorMessage) {
      toast.error(errorMessage);
      return;
    }

    try {
      if (editing) {
        await axiosInstance.post("/materials/update", {
          id: editing.id,
          ...form,
        });
        toast.success("Material updated.");
      } else {
        await axiosInstance.post("/materials/create", form);
        toast.success("Material created.");
      }

      setIsModalOpen(false);
      await fetchList();
    } catch (e) {
      toast.error(e?.response?.data?.message || "Save failed.");
    }
  }

  async function submitDelete() {
    if (!deleteTarget) return;
    try {
      await axiosInstance.post("/materials/delete", { id: deleteTarget.id });
      toast.success("Material deleted.");
      await fetchList();
    } catch (e) {
      toast.error(e?.response?.data?.message || "Delete failed.");
    } finally {
      setDeleteTarget(null);
    }
  }

  const columns = [
    { key: "name", label: "Name" },
    { key: "unit", label: "Unit" },
    { key: "totalQuantity", label: "Total" },
    { key: "availableQuantity", label: "Available" },
    { key: "reservedQuantity", label: "Reserved" },
    { key: "ownerEmail", label: "Owner" },
    {
      key: "requiresApproval",
      label: "Approval Required",
      render: (row) => (
        <Pill tone={row.requiresApproval ? "yes" : "no"}>
          {row.requiresApproval ? "Required" : "No"}
        </Pill>
      ),
    },
    {
      key: "actions",
      label: "Actions",
      render: (row) => (
        <div className="flex items-center gap-2">
          <button
            type="button"
            title="View"
            className="inline-flex items-center justify-center rounded-lg border border-slate-200 p-2 text-slate-700 hover:bg-slate-50"
            onClick={() => setViewItem(row)}
          >
            <FaEye className="h-4 w-4" />
          </button>
          {role === "admin" && (
            <>
              <button
                type="button"
                title="Edit"
                className="inline-flex items-center justify-center rounded-lg border border-slate-200 p-2 text-slate-700 hover:bg-slate-50"
                onClick={() => openEdit(row)}
              >
                <FaPencilAlt className="h-4 w-4" />
              </button>
              <button
                type="button"
                title="Delete"
                className="inline-flex items-center justify-center rounded-lg border border-rose-200 bg-rose-50 p-2 text-rose-700 hover:bg-rose-100"
                onClick={() => setDeleteTarget(row)}
              >
                <FaTrash className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <DataTable
        title="Materials"
        subtitle="Consumable lab materials"
        columns={columns}
        rows={items}
        searchValue={search}
        searchPlaceholder="Search by name, unit, or description..."
        onSearchChange={(v) => {
          setSearch(v);
          setPage(1);
        }}
        page={page}
        pageSize={DASHBOARD_PAGE_SIZE}
        onPageChange={setPage}
        totalPages={totalPages}
        isLoading={isLoading}
        actions={
          role === "admin" ? (
            <button
              type="button"
              onClick={openCreate}
              className="w-full rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 sm:w-auto"
            >
              Add Material
            </button>
          ) : null
        }
      />

      <Modal
        title={editing ? "Edit Material" : "Add Material"}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      >
        <form className="space-y-4" onSubmit={handleSave}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-1">
              <label className="block text-sm font-medium text-slate-700">
                Name <span className="text-red-500 ml-1">*</span>
              </label>
              <input
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-100"
              />
            </div>
            <div className="sm:col-span-1">
              <label className="block text-sm font-medium text-slate-700">
                Unit
              </label>
              <CustomSelect
                options={ALLOWED_UNITS}
                value={form.unit}
                onChange={(val) => setForm((p) => ({ ...p, unit: val }))}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-slate-700">
                Total Quantity <span className="text-red-500 ml-1">*</span>
              </label>
              <input
                type="number"
                value={form.totalQuantity}
                onChange={(e) =>
                  setForm((p) => ({ ...p, totalQuantity: Number(e.target.value) }))
                }
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-100"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">
              Description
            </label>
            <textarea
              value={form.description}
              onChange={(e) =>
                setForm((p) => ({ ...p, description: e.target.value }))
              }
              rows={3}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-100"
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.requiresApproval}
              onChange={(e) =>
                setForm((p) => ({ ...p, requiresApproval: e.target.checked }))
              }
              className="h-4 w-4 rounded border-slate-300"
            />
            Requires approval
          </label>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Save
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={submitDelete}
        title="Delete Material"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? This action cannot be undone.`}
      />

      {/* View / Book Modal */}
      <Modal title="Material Info" isOpen={Boolean(viewItem)} onClose={() => setViewItem(null)}>
        {viewItem && (
          <MaterialViewModal item={viewItem} role={role} onClose={() => setViewItem(null)} onBooked={fetchList} />
        )}
      </Modal>
    </>
  );
}

/**
 * The main dashboard page that renders the Instruments and Materials sections.
 */
export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <InstrumentsSection />
      <MaterialsSection />
    </div>
  );
}
