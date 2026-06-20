/**
 * @fileoverview Tiny prefixed logger so log lines are attributable to Helmsman
 * (and easy to filter) in the popup, options page, and service-worker consoles.
 */
const PREFIX = '[Helmsman]';

export const log = {
  debug: (...args: unknown[]): void => console.debug(PREFIX, ...args),
  warn: (...args: unknown[]): void => console.warn(PREFIX, ...args),
  error: (...args: unknown[]): void => console.error(PREFIX, ...args),
};
