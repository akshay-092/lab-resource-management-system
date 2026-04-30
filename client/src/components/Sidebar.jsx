import { FaClipboardCheck, FaHistory, FaHome } from "react-icons/fa";
import { getUserRole } from "../utils/auth.js";

function getItemClassName(isActive) {
  return [
    "w-full flex items-center justify-start gap-3 rounded-xl px-3 py-2 text-sm font-medium transition whitespace-nowrap text-left",
    isActive
      ? "bg-slate-900 text-white shadow-sm"
      : "text-slate-700 hover:bg-slate-100",
  ].join(" ");
}

function SidebarNav({ activeTab, onTabChange, onNavigate }) {
  const role = getUserRole();

  return (
    <div className="h-full p-4">
      <nav className="space-y-1">
        <button
          type="button"
          className={getItemClassName(activeTab === "home")}
          onClick={() => {
            onTabChange?.("home");
            onNavigate?.();
          }}
        >
          <FaHome className="h-4 w-4" />
          <span>Home</span>
        </button>

        {role === "user" ? (
          <button
            type="button"
            className={getItemClassName(activeTab === "history")}
            onClick={() => {
              onTabChange?.("history");
              onNavigate?.();
            }}
          >
            <FaHistory className="h-4 w-4" />
            <span>My Bookings</span>
          </button>
        ) : null}

        {role === "admin" ? (
          <button
            type="button"
            className={getItemClassName(activeTab === "approvals")}
            onClick={() => {
              onTabChange?.("approvals");
              onNavigate?.();
            }}
          >
            <FaClipboardCheck className="h-4 w-4" />
            <span>Approvals Pending</span>
          </button>
        ) : null}
      </nav>
    </div>
  );
}

/**
 * Sidebar navigation:
 * - Desktop: static left sidebar
 */
export default function Sidebar({
  activeTab,
  onTabChange,
}) {
  return (
    <aside className="hidden sm:block w-64 shrink-0 border-r border-slate-200/60 bg-white overflow-y-auto">
      <SidebarNav activeTab={activeTab} onTabChange={onTabChange} />
    </aside>
  );
}
