import { useEffect, useState } from "react";

/**
 * Returns a debounced copy of a value.
 *
 * @template T
 * @param {T} value
 * @param {number} delayMs
 * @returns {T}
 */
export default function useDebouncedValue(value, delayMs = 300) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debouncedValue;
}

