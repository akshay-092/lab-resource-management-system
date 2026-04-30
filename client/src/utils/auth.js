import { normalize } from "./common.js";

/**
 * Gets the current user data from localStorage.
 *
 * @returns {null | { token?: string, id?: string, email?: string, role?: string }}
 */
export function getUserData() {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem("userData");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Gets the current user role from stored user data.
 *
 * @returns {"admin" | "user" | null}
 */
export function getUserRole() {
  const userData = getUserData();
  const role = userData?.role ? normalize(userData.role) : null;
  return role === "admin" || role === "user" ? role : null;
}

/**
 * Gets the auth token, preferring `localStorage.token` and falling back to `userData.token`.
 *
 * @returns {string | null}
 */
export function getAuthToken() {
  if (typeof window === "undefined") return null;

  const tokenFromKey = window.localStorage.getItem("token");
  if (tokenFromKey) return tokenFromKey;

  const userData = getUserData();
  return userData?.token || null;
}

/**
 * Checks whether the user is authenticated (token exists).
 *
 * @returns {boolean}
 */
export function isAuthenticated() {
  return Boolean(getAuthToken());
}

/**
 * Clears stored auth information.
 *
 * @returns {void}
 */
export function clearAuth() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem("token");
  window.localStorage.removeItem("userData");
}
