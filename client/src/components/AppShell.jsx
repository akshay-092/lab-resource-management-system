import { useState } from "react";
import Navbar from "./Navbar.jsx";
import Sidebar from "./Sidebar.jsx";
import ApprovalsPage from "../pages/ApprovalsPage.jsx";
import DashboardPage from "../pages/DashboardPage.jsx";
import HistoryPage from "../pages/HistoryPage.jsx";
import { getUserRole } from "../utils/auth.js";

export default function AppShell() {
  const [activeTab, setActiveTab] = useState("home");

  const role = getUserRole();

  let content = <DashboardPage />;
  if (activeTab === "history" && role === "user") content = <HistoryPage />;
  if (activeTab === "approvals" && role === "admin") content = <ApprovalsPage />;

  return (
    <div className="h-screen bg-slate-50 flex flex-col">
      <Navbar />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-7xl p-4 sm:p-6">
            <div className="p-6 sm:p-4">
              {content}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
