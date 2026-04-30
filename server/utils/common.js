const mongoose = require("mongoose");

/**
 * Validates whether a value is a valid MongoDB ObjectId.
 *
 * @param {string} value
 * @returns {boolean}
 */
function isValidObjectId(value) {
  return mongoose.Types.ObjectId.isValid(value);
}

/**
 * Escapes special characters in a string for use in a regular expression.
 *
 * @param {string} value
 * @returns {string}
 */
function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Parses a date string and returns a Date object or null if invalid.
 *
 * @param {string} value
 * @returns {Date|null}
 */
function parseDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Calculates minutes between two dates.
 *
 * @param {Date} start
 * @param {Date} end
 * @returns {number}
 */
function minutesBetween(start, end) {
  return (end.getTime() - start.getTime()) / (1000 * 60);
}

/**
 * Converts a value to a finite number, otherwise returns NaN.
 *
 * @param {unknown} value
 * @returns {number}
 */
function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : NaN;
}

module.exports = {
  isValidObjectId,
  toNumber,
  escapeRegex,
  parseDate,
  minutesBetween,
};
