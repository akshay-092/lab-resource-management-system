import { useMemo, useState } from "react";
import { toast } from "react-toastify";
import { MIN_PASSWORD_LENGTH } from "../utils/constants.js";
import { axiosInstance } from "../utils/axiosInstance.js";
import { useNavigate } from "react-router-dom";

/**
 * Validates an email string with a simple rule.
 *
 * @param {string} email
 * @returns {boolean}
 */
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Gets the email field error message (or an empty string if valid).
 *
 * @param {string} email
 * @returns {string}
 */
function getEmailError(email) {
  const trimmedEmail = email.trim();

  if (!trimmedEmail) return "Email is required.";
  if (!isValidEmail(trimmedEmail)) return "Invalid email address.";
  return "";
}

/**
 * Gets the password field error message (or an empty string if valid).
 *
 * @param {string} password
 * @returns {string}
 */
function getPasswordError(password) {
  if (!password) return "Password is required.";
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  return "";
}

/**
 * Returns an object of field errors for the login form.
 *
 * @param {{ email: string, password: string }} params
 * @returns {{ email?: string, password?: string }}
 */
function validateLoginForm({ email, password }) {
  const errors = {};

  const emailError = getEmailError(email);
  if (emailError) errors.email = emailError;

  const passwordError = getPasswordError(password);
  if (passwordError) errors.password = passwordError;

  return errors;
}

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({ email: false, password: false });

  const isFormValid = useMemo(() => {
    const nextErrors = validateLoginForm({ email, password });
    return Object.keys(nextErrors).length === 0;
  }, [email, password]);

  const emailError = (touched.email ? getEmailError(email) : "") || errors.email;
  const passwordError =
    (touched.password ? getPasswordError(password) : "") || errors.password;

  /**
   * Handles form submission:
   * - validates fields
   * - shows a toast for errors/success
   */
  async function handleSubmit(event) {
    event.preventDefault();
    setTouched({ email: true, password: true });

    const nextErrors = validateLoginForm({ email, password });
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      toast.error("Please fix the highlighted fields.");
      return;
    }

    try {
      setIsSubmitting(true);

      const response = await axiosInstance.post("/auth/login", {
        email,
        password,
      });

      const userData = response?.data?.userData || null;
      const token = response?.data?.token || userData?.token || null;

      // store userData and token in localStorage
      if (userData) {
        localStorage.setItem("userData", JSON.stringify(userData));
      }
      if (token) localStorage.setItem("token", token);

      toast.success(response?.data?.message || "Logged in successfully!");
      navigate("/", { replace: true });
    } catch (error) {
      const apiMessage =
        error?.response?.data?.message ||
        error?.message ||
        "Login failed. Please try again.";
      toast.error(apiMessage);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10 flex items-center justify-center">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-lg ring-1 ring-black/5">
        <div className="px-6 py-8 sm:px-8">
          <h1 className="text-2xl font-semibold text-slate-900">Login</h1>
          <p className="mt-1 text-sm text-slate-600">
            Sign in with your email and password.
          </p>

          <form className="mt-6 space-y-4" onSubmit={handleSubmit} noValidate>
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-slate-700"
              >
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => {
                  const nextEmail = e.target.value;
                  setEmail(nextEmail);

                  // Clear/show error immediately once the user corrects the value.
                  if (touched.email || errors.email) {
                    const nextEmailError = getEmailError(nextEmail);
                    setErrors((prev) => {
                      if (!nextEmailError) {
                        const { email: _email, ...rest } = prev;
                        return rest;
                      }
                      return { ...prev, email: nextEmailError };
                    });
                  }
                }}
                onBlur={() => setTouched((prev) => ({ ...prev, email: true }))}
                className={[
                  "mt-1 block w-full rounded-xl border bg-white px-3 py-2 text-slate-900 outline-none transition",
                  "placeholder:text-slate-400",
                  emailError
                    ? "border-rose-300 ring-2 ring-rose-100 focus:border-rose-400"
                    : "border-slate-200 focus:border-slate-300 focus:ring-2 focus:ring-slate-100",
                ].join(" ")}
                placeholder="you@example.com"
              />
              {emailError ? (
                <p className="mt-1 text-xs text-rose-600">{emailError}</p>
              ) : null}
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-slate-700"
              >
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => {
                  const nextPassword = e.target.value;
                  setPassword(nextPassword);

                  // Clear/show error immediately once the user corrects the value.
                  if (touched.password || errors.password) {
                    const nextPasswordError = getPasswordError(nextPassword);
                    setErrors((prev) => {
                      if (!nextPasswordError) {
                        const { password: _password, ...rest } = prev;
                        return rest;
                      }
                      return { ...prev, password: nextPasswordError };
                    });
                  }
                }}
                onBlur={() =>
                  setTouched((prev) => ({ ...prev, password: true }))
                }
                className={[
                  "mt-1 block w-full rounded-xl border bg-white px-3 py-2 text-slate-900 outline-none transition",
                  "placeholder:text-slate-400",
                  passwordError
                    ? "border-rose-300 ring-2 ring-rose-100 focus:border-rose-400"
                    : "border-slate-200 focus:border-slate-300 focus:ring-2 focus:ring-slate-100",
                ].join(" ")}
                placeholder="••••••••"
              />
              {passwordError ? (
                <p className="mt-1 text-xs text-rose-600">{passwordError}</p>
              ) : (
                <p className="mt-1 text-xs text-slate-500">
                  Minimum {MIN_PASSWORD_LENGTH} characters.
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={isSubmitting || !isFormValid}
              className={[
                "mt-2 inline-flex w-full items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold text-white",
                "shadow-sm transition focus:outline-none focus:ring-2 focus:ring-slate-200",
                isSubmitting || !isFormValid
                  ? "bg-slate-400 cursor-not-allowed"
                  : "bg-slate-900 hover:bg-slate-800 active:bg-slate-950",
              ].join(" ")}
            >
              {isSubmitting ? "Logging in..." : "Login"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
