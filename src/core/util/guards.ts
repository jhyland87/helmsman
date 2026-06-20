/**
 * @fileoverview Small runtime type guards and safe coercers for narrowing the
 * `unknown`-typed values that arrive from the Moonraker wire protocol, so the
 * rest of the codebase can avoid `as` assertions.
 */

/** True for a non-null object (record). */
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** True for an array (narrowed to `unknown[]` rather than `any[]`). */
export const isUnknownArray = (value: unknown): value is unknown[] => Array.isArray(value);

/** True for a finite number. */
export const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** True for a string. */
export const isString = (value: unknown): value is string => typeof value === 'string';

/** Return `value` if it's a finite number, else `undefined`. */
export const toFiniteNumber = (value: unknown): number | undefined =>
  isFiniteNumber(value) ? value : undefined;

/** Return `value` if it's a string, else `undefined`. */
export const toStringValue = (value: unknown): string | undefined =>
  isString(value) ? value : undefined;

/** Return `value` if it's a record, else `undefined`. */
export const toRecord = (value: unknown): Record<string, unknown> | undefined =>
  isRecord(value) ? value : undefined;

/** Return `value` if it's an array, else `undefined`. */
export const toArray = (value: unknown): unknown[] | undefined =>
  isUnknownArray(value) ? value : undefined;

/**
 * Type guard: is `value` one of a string enum's member values? Lets callers
 * narrow a raw `string` (e.g. a `<select>` value) to the enum without `as`.
 */
export const isEnumValue = <T extends Record<string, string>>(
  enumObj: T,
  value: string,
): value is T[keyof T] => Object.values(enumObj).some((member) => member === value);
