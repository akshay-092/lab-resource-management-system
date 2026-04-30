import { useMemo } from "react";
import { getUserData, clearAuth } from "../utils/auth.js";

/**
 * Returns initials for an avatar circle from the user's email.
 *
 * @param {string | undefined} email
 * @returns {string}
 */
function getAvatarLetter(email) {
  const safeEmail = String(email || "").trim();
  if (!safeEmail) return "?";
  return safeEmail[0].toUpperCase();
}

/**
 * Returns a friendly greeting name from email (text before "@").
 *
 * @param {string | undefined} email
 * @returns {string}
 */
function getGreetingName(email) {
  const safeEmail = String(email || "").trim();
  if (!safeEmail) return "there";
  return safeEmail.split("@")[0] || "there";
}

/**
 * Top navigation bar for the dashboard layout.
 *
 * @param {{ onMenuClick?: () => void }} props
 * @returns {JSX.Element}
 */
export default function Navbar() {
  const userData = useMemo(() => getUserData(), []);
  const email = userData?.email;

  const avatarLetter = getAvatarLetter(email);
  const greetingName = getGreetingName(email);

  const handleLogout = () => {
    clearAuth();
    window.location.href = "/login";
  };

  return (
    <header className="sticky top-0 z-20 w-full border-b border-slate-200/60 bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex items-center gap-3 min-w-0">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">
              Trivia Lab System
            </p>
            <p className="truncate text-xs text-slate-600">
              Lab Resource Management
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 min-w-0">
          <div className="min-w-0 text-right">
            <p className="truncate text-sm font-semibold text-slate-900">
              Hello, {greetingName}
            </p>
            {email ? (
              <p className="truncate text-xs text-slate-600">{email}</p>
            ) : null}
          </div>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white shadow-sm ring-1 ring-black/10">
            {avatarLetter}
          </div>
          <button
            onClick={handleLogout}
            className="ml-2 rounded-md bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-inset ring-slate-300 hover:bg-slate-50 transition-colors"
          >
            Logout
          </button>
        </div>
      </div>
    </header>
  );
}
