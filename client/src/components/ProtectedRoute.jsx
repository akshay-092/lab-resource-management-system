import { Navigate, Outlet } from "react-router-dom";
import { isAuthenticated } from "../utils/auth.js";

/**
 * Protects routes that require authentication.
 */
export default function ProtectedRoute() {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}

