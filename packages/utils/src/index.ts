import {
  format,
  formatDistanceToNow,
  parseISO,
  isValid,
  addDays,
  addHours,
  addMinutes,
  isBefore,
  isAfter,
  differenceInSeconds,
  differenceInMinutes,
  differenceInHours,
  differenceInDays,
} from "date-fns";
import { nanoid } from "nanoid";

// ============================================================
// ID Generation Utilities
// ============================================================

/**
 * Generate a unique ID with optional prefix
 */
export function generateId(prefix?: string, length = 21): string {
  const id = nanoid(length);
  return prefix ? `${prefix}_${id}` : id;
}

/**
 * Generate a message ID for emails
 */
export function generateMessageId(domain: string): string {
  const timestamp = Date.now().toString(36);
  const random = nanoid(16);
  return `<${timestamp}.${random}@${domain}>`;
}

/**
 * Generate a cryptographically secure token
 */
export function generateSecureToken(length = 32): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  const randomValues = new Uint32Array(length);
  crypto.getRandomValues(randomValues);
  for (let i = 0; i < length; i++) {
    const randomValue = randomValues[i];
    if (randomValue !== undefined) {
      result += chars[randomValue % chars.length] ?? "";
    }
  }
  return result;
}

/**
 * Generate a short code (for verification, etc.)
 */
export function generateShortCode(length = 6): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "";
  const randomValues = new Uint32Array(length);
  crypto.getRandomValues(randomValues);
  for (let i = 0; i < length; i++) {
    const randomValue = randomValues[i];
    if (randomValue !== undefined) {
      result += chars[randomValue % chars.length] ?? "";
    }
  }
  return result;
}

// ============================================================
// String Utilities
// ============================================================

/**
 * Slugify a string
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replaceAll(/[^\w\s-]/g, "")
    .replaceAll(/[\s_-]+/g, "-")
    .replaceAll(/(?:^-+)|(?:-+$)/g, "");
}

/**
 * Truncate a string with ellipsis
 */
export function truncate(text: string, maxLength: number, suffix = "..."): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - suffix.length).trim() + suffix;
}

/**
 * Capitalize the first letter of a string
 */
export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

/**
 * Convert string to title case
 */
export function titleCase(text: string): string {
  return text
    .toLowerCase()
    .split(" ")
    .map((word) => capitalize(word))
    .join(" ");
}

/**
 * Mask email address for privacy
 */
export function maskEmail(email: string): string {
  const [localPart, domain] = email.split("@");
  if (!localPart || !domain) return email;

  const maskedLocal =
    localPart.length <= 2
      ? "*".repeat(localPart.length)
      : (localPart[0] ?? "*") + "*".repeat(localPart.length - 2) + (localPart.at(-1) ?? "*");

  return `${maskedLocal}@${domain}`;
}

/**
 * Extract initials from a name
 */
export function getInitials(name: string, maxLength = 2): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, maxLength)
    .join("")
    .toUpperCase();
}

// ============================================================
// Email Utilities
// ============================================================

/**
 * Validate email address format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Extract domain from email address
 */
export function extractEmailDomain(email: string): string | null {
  const match = /@([^@]+)$/.exec(email);
  return match?.[1]?.toLowerCase() ?? null;
}

/**
 * Normalize email address
 */
export function normalizeEmail(email: string): string {
  const [localPart, domain] = email.toLowerCase().split("@");
  if (!localPart || !domain) return email.toLowerCase();

  // Remove dots from gmail addresses
  let normalizedLocal = localPart;
  if (domain === "gmail.com" || domain === "googlemail.com") {
    normalizedLocal = localPart.replaceAll(".", "").split("+")[0] ?? localPart;
  }

  return `${normalizedLocal}@${domain}`;
}

/**
 * Parse email address with display name
 */
export function parseEmailAddress(input: string): { address: string; name?: string } {
  const match = /^(?:"?([^"]*)"?\s)?<?([^\s<>]+@[^\s<>]+)>?$/.exec(input);
  if (match?.[2]) {
    const result: { address: string; name?: string } = {
      address: match[2].toLowerCase(),
    };
    const parsedName = match[1]?.trim();
    if (parsedName) {
      result.name = parsedName;
    }
    return result;
  }
  return { address: input.toLowerCase() };
}

/**
 * Format email address with display name
 */
export function formatEmailAddress(address: string, name?: string): string {
  if (!name) return address;
  // Escape quotes in name
  const escapedName = name.replaceAll('"', String.raw`\"`);
  return `"${escapedName}" <${address}>`;
}

// ============================================================
// Date Utilities
// ============================================================

/**
 * Format a date to ISO string
 */
export function toISOString(date: Date | string): string {
  const d = typeof date === "string" ? parseISO(date) : date;
  return d.toISOString();
}

/**
 * Format date for display
 */
export function formatDate(date: Date | string, formatStr = "MMM d, yyyy"): string {
  const d = typeof date === "string" ? parseISO(date) : date;
  return format(d, formatStr);
}

/**
 * Format date and time for display
 */
export function formatDateTime(date: Date | string, formatStr = "MMM d, yyyy h:mm a"): string {
  const d = typeof date === "string" ? parseISO(date) : date;
  return format(d, formatStr);
}

/**
 * Get relative time string
 */
export function formatRelativeTime(date: Date | string): string {
  const d = typeof date === "string" ? parseISO(date) : date;
  return formatDistanceToNow(d, { addSuffix: true });
}

/**
 * Check if a date is valid
 */
export function isValidDate(date: unknown): date is Date {
  return date instanceof Date && isValid(date);
}

/**
 * Add time to a date
 */
export function addTime(date: Date, amount: number, unit: "minutes" | "hours" | "days"): Date {
  switch (unit) {
    case "minutes":
      return addMinutes(date, amount);
    case "hours":
      return addHours(date, amount);
    case "days":
      return addDays(date, amount);
  }
}

/**
 * Check if a date is expired
 */
export function isExpired(date: Date | string): boolean {
  const d = typeof date === "string" ? parseISO(date) : date;
  return isBefore(d, new Date());
}

/**
 * Check if a date is in the future
 */
export function isFuture(date: Date | string): boolean {
  const d = typeof date === "string" ? parseISO(date) : date;
  return isAfter(d, new Date());
}

/**
 * Get time difference in human readable format
 */
export function getTimeDifference(
  from: Date,
  to: Date = new Date()
): { value: number; unit: "seconds" | "minutes" | "hours" | "days" } {
  const seconds = Math.abs(differenceInSeconds(to, from));

  if (seconds < 60) {
    return { value: seconds, unit: "seconds" };
  }

  const minutes = differenceInMinutes(to, from);
  if (Math.abs(minutes) < 60) {
    return { value: Math.abs(minutes), unit: "minutes" };
  }

  const hours = differenceInHours(to, from);
  if (Math.abs(hours) < 24) {
    return { value: Math.abs(hours), unit: "hours" };
  }

  const days = differenceInDays(to, from);
  return { value: Math.abs(days), unit: "days" };
}

// ============================================================
// Number & Formatting Utilities
// ============================================================

/**
 * Format bytes to human readable string
 */
export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const dm = Math.max(0, decimals);
  const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB"] as const;

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${Number.parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

/**
 * Format number with thousand separators
 */
export function formatNumber(num: number, locale = "en-US"): string {
  return new Intl.NumberFormat(locale).format(num);
}

/**
 * Format percentage
 */
export function formatPercentage(value: number, decimals = 1): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

/**
 * Clamp a number between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

// ============================================================
// Object Utilities
// ============================================================

/**
 * Deep clone an object
 */
export function deepClone<T>(obj: T): T {
  return structuredClone(obj);
}

/**
 * Remove undefined and null values from an object
 */
export function compact<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([_, v]) => v !== undefined && v !== null)
  ) as Partial<T>;
}

/**
 * Pick specific keys from an object
 */
export function pick<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: K[]
): Pick<T, K> {
  return keys.reduce(
    (acc, key) => {
      if (key in obj) {
        acc[key] = obj[key];
      }
      return acc;
    },
    {} as Pick<T, K>
  );
}

/**
 * Omit specific keys from an object
 */
export function omit<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: K[]
): Omit<T, K> {
  const result = { ...obj } as Record<string, unknown>;
  for (const key of keys) {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete result[key as string];
  }
  return result as Omit<T, K>;
}

/**
 * Check if an object is empty
 */
export function isEmpty(obj: Record<string, unknown>): boolean {
  return Object.keys(obj).length === 0;
}

// ============================================================
// Array Utilities
// ============================================================

/**
 * Chunk an array into smaller arrays
 */
export function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Remove duplicates from an array
 */
export function unique<T>(array: T[]): T[] {
  return [...new Set(array)];
}

/**
 * Remove duplicates by key
 */
export function uniqueBy<T>(array: T[], key: keyof T): T[] {
  const seen = new Set();
  return array.filter((item) => {
    const k = item[key];
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * Group array items by key
 */
export function groupBy<T extends Record<string, unknown>>(
  array: T[],
  key: keyof T
): Record<string, T[]> {
  return array.reduce<Record<string, T[]>>((acc, item) => {
    const value = item[key];
    const k = typeof value === "string" ? value : JSON.stringify(value);
    acc[k] ??= [];
    acc[k].push(item);
    return acc;
  }, {});
}

// ============================================================
// Async Utilities
// ============================================================

/**
 * Sleep for a specified duration
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number;
    initialDelay?: number;
    maxDelay?: number;
    factor?: number;
    onRetry?: (error: Error, attempt: number) => void;
  } = {}
): Promise<T> {
  const { maxAttempts = 3, initialDelay = 1000, maxDelay = 30000, factor = 2, onRetry } = options;

  let lastError: Error = new Error("Retry failed");
  let delay = initialDelay;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxAttempts) {
        onRetry?.(lastError, attempt);
        await sleep(delay);
        delay = Math.min(delay * factor, maxDelay);
      }
    }
  }

  throw lastError;
}

/**
 * Execute promises with concurrency limit
 */
export async function pLimit<T>(tasks: (() => Promise<T>)[], concurrency: number): Promise<T[]> {
  const results: T[] = [];
  const executing = new Set<Promise<void>>();

  for (const task of tasks) {
    const resultPromise = (async () => {
      const result = await task();
      results.push(result);
    })();

    const executingPromise = resultPromise.finally(() => {
      executing.delete(executingPromise);
    });
    executing.add(executingPromise);

    if (executing.size >= concurrency) {
      await Promise.race(executing);
    }
  }

  await Promise.all(executing);
  return results;
}

// ============================================================
// Export all utilities
// ============================================================
export {
  format,
  formatDistanceToNow,
  parseISO,
  isValid,
  addDays,
  addHours,
  addMinutes,
  isBefore,
  isAfter,
  differenceInSeconds,
  differenceInMinutes,
  differenceInHours,
  differenceInDays,
} from "date-fns";

export { nanoid } from "nanoid";

// ============================================================
// Rate Limiting
// ============================================================
export {
  RedisRateLimiter,
  InMemoryRateLimiter,
  createRateLimiter,
  RATE_LIMIT_TIERS,
  type RateLimitResult,
  type RateLimiterOptions,
  type RateLimitConfig,
  type RateLimitTier,
} from "./rate-limiter.js";

// ============================================================
// Redis Client (server-only — import directly from "./redis.js")
// ============================================================
// NOTE: Redis utilities are NOT re-exported here because redis.ts
// uses node:module and ioredis which break client/edge webpack builds.
// Server-side consumers should import from "@email/utils/redis" or
// the file directly.
