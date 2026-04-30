/**
 * Normalizes a value to a lowercase string for safe comparison.
 * @param {any} value 
 * @returns {string}
 */
export function normalize(value) {
  return String(value || "").toLowerCase();
}

/**
 * Formats a date string into a localized, human-readable format.
 * @param {string} dateStr 
 * @returns {string}
 */
export function formatDate(dateStr) {
  if (!dateStr) return " ";
  return new Date(dateStr).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
