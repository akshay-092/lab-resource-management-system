import { Navigate, Outlet } from "react-router-dom";
import { getUserRole, isAuthenticated } from "../utils/auth.js";


// Protects admin-only routes.
export default function AdminRoute() {
  if (!isAuthenticated()) return <Navigate to="/login" replace />;

  const role = getUserRole();
  if (role !== "admin") return <Navigate to="/" replace />;

  return <Outlet />;
}

