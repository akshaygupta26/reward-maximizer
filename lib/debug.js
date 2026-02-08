/**
 * Debug Utility for Reward Maximizer
 *
 * Usage:
 * - Import this file in any script that needs logging
 * - Use debug.log(), debug.warn(), debug.error() instead of console.*
 * - Set DEBUG = false before publishing to Chrome Web Store
 * - Set DEBUG = true for development
 */

// ⚙️ PRODUCTION TOGGLE: Set to false before Chrome Web Store submission
const DEBUG = true;

/**
 * Debug logger with conditional output
 */
const debug = {
  /**
   * Log informational messages
   * @param {...any} args - Messages to log
   */
  log: (...args) => {
    if (DEBUG) {
      console.log(...args);
    }
  },

  /**
   * Log warning messages (always shown, even in production)
   * @param {...any} args - Messages to log
   */
  warn: (...args) => {
    // Warnings should always be visible for troubleshooting
    console.warn(...args);
  },

  /**
   * Log error messages (always shown, even in production)
   * @param {...any} args - Messages to log
   */
  error: (...args) => {
    // Errors should always be visible for troubleshooting
    console.error(...args);
  },

  /**
   * Log informational message with prefix
   * @param {string} prefix - Prefix for the log message (e.g., "[RMX Scraper]")
   * @param {...any} args - Messages to log
   */
  info: (prefix, ...args) => {
    if (DEBUG) {
      console.log(prefix, ...args);
    }
  },

  /**
   * Log a group of messages (collapsible in console)
   * @param {string} label - Group label
   * @param {Function} fn - Function containing logs to group
   */
  group: (label, fn) => {
    if (DEBUG) {
      console.group(label);
      fn();
      console.groupEnd();
    }
  },

  /**
   * Log a table (useful for arrays of objects)
   * @param {any} data - Data to display as table
   */
  table: (data) => {
    if (DEBUG) {
      console.table(data);
    }
  },

  /**
   * Check if debug mode is enabled
   * @returns {boolean}
   */
  isEnabled: () => DEBUG,

  /**
   * Performance timing utility
   * @param {string} label - Label for the timer
   */
  time: (label) => {
    if (DEBUG) {
      console.time(label);
    }
  },

  /**
   * End performance timing
   * @param {string} label - Label for the timer
   */
  timeEnd: (label) => {
    if (DEBUG) {
      console.timeEnd(label);
    }
  }
};

// For use in background scripts and content scripts
if (typeof window !== 'undefined') {
  window.debug = debug;
}

// For use in modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = debug;
}
