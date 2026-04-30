import axios from "axios";
import { clearAuth } from "./auth.js";

/**
 * Creates an Axios instance with a base URL and default headers.
 */
export const axiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api",
  headers: {
    "Content-Type": "application/json",
  },
});

axiosInstance.interceptors.request.use((config) => {
  if (typeof window === "undefined") return config;

  const tokenFromKey = window.localStorage.getItem("token");

  let token = tokenFromKey;
  if (!token) {
    try {
      const rawUserData = window.localStorage.getItem("userData");
      const userData = rawUserData ? JSON.parse(rawUserData) : null;
      token = userData?.token || null;
    } catch {
      token = null;
    }
  }

  if (!token) return config;

  config.headers = config.headers || {};
  config.headers.Authorization = `Bearer ${token}`;

  return config;
});

axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const isLoginRequest = error?.config?.url?.includes("/auth/login");

    // If token is invalid/expired, clear auth and redirect to login.
    // BUT don't do this if we are currently trying to log in!
    if (typeof window !== "undefined" && status === 401 && !isLoginRequest) {
      clearAuth();
      window.location.replace("/login");
    }

    return Promise.reject(error);
  }
);
