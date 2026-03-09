/**
 * Date utility functions for timezone-safe date handling.
 *
 * All dates in this application are "business dates" (calendar dates with no time component).
 * When the user says "January 1", they mean the entire calendar day of January 1,
 * regardless of timezone.
 *
 * The Problem:
 * JavaScript's `new Date('2025-01-01')` creates a date at midnight UTC, which is
 * December 31 at 7pm in US Eastern time. When this gets compared against dates
 * stored in the database, the boundaries are off by one day.
 *
 * The Solution:
 * - For date storage: Use noon UTC to avoid any date shifting across all US timezones
 * - For range queries: Use start of day (00:00:00.000Z) and end of day (23:59:59.999Z) UTC
 * - For as-of queries: Use end of day (23:59:59.999Z) UTC
 */

/**
 * Parse a date string as a business date (noon UTC to avoid timezone shifting).
 * Use this when STORING dates (journal entries, sales, etc.)
 *
 * @param dateString - Date string in YYYY-MM-DD format or any parseable format
 * @returns Date object at noon UTC on that calendar day
 *
 * @example
 * parseBusinessDate('2025-01-01') // => 2025-01-01T12:00:00.000Z
 */
export function parseBusinessDate(dateString: string): Date {
  // Handle YYYY-MM-DD format explicitly to avoid timezone issues
  const match = dateString.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    const [, year, month, day] = match;
    return new Date(`${year}-${month}-${day}T12:00:00.000Z`);
  }

  // For other formats, parse and set to noon UTC
  const parsed = new Date(dateString);
  if (isNaN(parsed.getTime())) {
    throw new Error(`Invalid date string: ${dateString}`);
  }

  // Extract the date components and create noon UTC
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return new Date(`${year}-${month}-${day}T12:00:00.000Z`);
}

/**
 * Get start of day for range queries (beginning of UTC day).
 * Use this for the START of date range queries.
 *
 * @param dateString - Date string in YYYY-MM-DD format
 * @returns Date object at 00:00:00.000 UTC on that calendar day
 *
 * @example
 * startOfDay('2025-01-01') // => 2025-01-01T00:00:00.000Z
 */
export function startOfDay(dateString: string): Date {
  // Handle YYYY-MM-DD format explicitly
  const match = dateString.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    const [, year, month, day] = match;
    return new Date(`${year}-${month}-${day}T00:00:00.000Z`);
  }

  // For other formats, parse and set to start of day UTC
  const parsed = new Date(dateString);
  if (isNaN(parsed.getTime())) {
    throw new Error(`Invalid date string: ${dateString}`);
  }

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return new Date(`${year}-${month}-${day}T00:00:00.000Z`);
}

/**
 * Get end of day for range queries (end of UTC day).
 * Use this for the END of date range queries and as-of-date queries.
 *
 * @param dateString - Date string in YYYY-MM-DD format
 * @returns Date object at 23:59:59.999 UTC on that calendar day
 *
 * @example
 * endOfDay('2025-01-31') // => 2025-01-31T23:59:59.999Z
 */
export function endOfDay(dateString: string): Date {
  // Handle YYYY-MM-DD format explicitly
  const match = dateString.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    const [, year, month, day] = match;
    return new Date(`${year}-${month}-${day}T23:59:59.999Z`);
  }

  // For other formats, parse and set to end of day UTC
  const parsed = new Date(dateString);
  if (isNaN(parsed.getTime())) {
    throw new Error(`Invalid date string: ${dateString}`);
  }

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return new Date(`${year}-${month}-${day}T23:59:59.999Z`);
}

/**
 * Format a Date object for display in YYYY-MM-DD format (timezone-safe).
 * Always returns the UTC date components to avoid timezone shifting.
 *
 * @param date - Date object to format
 * @returns String in YYYY-MM-DD format
 *
 * @example
 * formatDate(new Date('2025-01-15T12:00:00.000Z')) // => '2025-01-15'
 */
export function formatDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Get the date string (YYYY-MM-DD) from a Date object in UTC.
 * Alias for formatDate for semantic clarity.
 */
export const toDateString = formatDate;

/**
 * Parse a local date (from user input like MM/DD/YYYY) into a business date.
 * The date components are interpreted as the intended calendar date.
 *
 * @param month - Month (1-12)
 * @param day - Day of month (1-31)
 * @param year - Full year (e.g., 2025)
 * @returns Date object at noon UTC
 */
export function localToBusinessDate(month: number, day: number, year: number): Date {
  const monthStr = String(month).padStart(2, '0');
  const dayStr = String(day).padStart(2, '0');
  return new Date(`${year}-${monthStr}-${dayStr}T12:00:00.000Z`);
}

/**
 * Check if a date string is in valid YYYY-MM-DD format.
 */
export function isValidDateString(dateString: string): boolean {
  const match = dateString.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;

  const [, year, month, day] = match;
  const date = new Date(`${year}-${month}-${day}T12:00:00.000Z`);
  return !isNaN(date.getTime());
}

/**
 * Create a date range filter object for Prisma queries.
 *
 * @param startDateStr - Start date string (YYYY-MM-DD)
 * @param endDateStr - End date string (YYYY-MM-DD)
 * @returns Object with gte and lte properties for Prisma where clause
 *
 * @example
 * const dateFilter = createDateRangeFilter('2025-01-01', '2025-01-31');
 * // => { gte: 2025-01-01T00:00:00.000Z, lte: 2025-01-31T23:59:59.999Z }
 */
export function createDateRangeFilter(
  startDateStr?: string | null,
  endDateStr?: string | null
): { gte?: Date; lte?: Date } | undefined {
  if (!startDateStr && !endDateStr) {
    return undefined;
  }

  const filter: { gte?: Date; lte?: Date } = {};

  if (startDateStr) {
    filter.gte = startOfDay(startDateStr);
  }

  if (endDateStr) {
    filter.lte = endOfDay(endDateStr);
  }

  return filter;
}

/**
 * Create an as-of date filter for Prisma queries (balance sheet, trial balance).
 *
 * @param asOfDateStr - As-of date string (YYYY-MM-DD)
 * @returns Object with lte property for Prisma where clause
 *
 * @example
 * const dateFilter = createAsOfDateFilter('2025-01-31');
 * // => { lte: 2025-01-31T23:59:59.999Z }
 */
export function createAsOfDateFilter(asOfDateStr: string): { lte: Date } {
  return { lte: endOfDay(asOfDateStr) };
}

/**
 * Display a date string in a human-readable format using UTC components.
 * This prevents timezone shifting when displaying dates to users.
 *
 * @param dateString - ISO date string or YYYY-MM-DD format
 * @param options - Intl.DateTimeFormat options (default: short month, numeric day, numeric year)
 * @returns Formatted date string (e.g., "Jan 1, 2025")
 *
 * @example
 * displayDate('2025-01-01T00:00:00.000Z') // => 'Jan 1, 2025'
 * displayDate('2025-01-01T00:00:00.000Z', { month: 'long' }) // => 'January 1, 2025'
 */
export function displayDate(
  dateString: string | Date,
  options: Intl.DateTimeFormatOptions = {}
): string {
  const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
  const defaultOptions: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',  // Key fix: use UTC to prevent timezone shifting
    ...options,
  };
  return date.toLocaleDateString('en-US', defaultOptions);
}

/**
 * Display a date range in a human-readable format using UTC components.
 *
 * @param startDate - Start date string
 * @param endDate - End date string
 * @returns Formatted date range string (e.g., "January 1, 2025 — January 31, 2025")
 */
export function displayDateRange(startDate: string | Date, endDate: string | Date): string {
  const start = displayDate(startDate, { month: 'long', day: 'numeric', year: 'numeric' });
  const end = displayDate(endDate, { month: 'long', day: 'numeric', year: 'numeric' });
  return `${start} — ${end}`;
}

/**
 * Display an as-of date in a human-readable format using UTC components.
 *
 * @param date - Date string
 * @returns Formatted as-of string (e.g., "As of January 31, 2025")
 */
export function displayAsOfDate(date: string | Date): string {
  return `As of ${displayDate(date, { month: 'long', day: 'numeric', year: 'numeric' })}`;
}
