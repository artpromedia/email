/**
 * Utility Functions Tests
 * Comprehensive tests for all utility functions
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  // ID Generation
  generateId,
  generateMessageId,
  generateSecureToken,
  generateShortCode,
  // String Utilities
  slugify,
  truncate,
  capitalize,
  titleCase,
  maskEmail,
  getInitials,
  // Email Utilities
  isValidEmail,
  extractEmailDomain,
  normalizeEmail,
  parseEmailAddress,
  formatEmailAddress,
  // Date Utilities
  toISOString,
  formatDate,
  formatDateTime,
  formatRelativeTime,
  isValidDate,
  addTime,
  isExpired,
  isFuture,
  getTimeDifference,
  // Number Utilities
  formatBytes,
  formatNumber,
  formatPercentage,
  clamp,
  // Object Utilities
  deepClone,
  compact,
  pick,
  omit,
  isEmpty,
  // Array Utilities
  chunk,
  unique,
  uniqueBy,
  groupBy,
  // Async Utilities
  sleep,
  retry,
  pLimit,
} from './index';

describe('ID Generation', () => {
  describe('generateId', () => {
    it('should generate unique IDs', () => {
      const id1 = generateId();
      const id2 = generateId();
      expect(id1).not.toBe(id2);
    });

    it('should generate IDs with specified length', () => {
      const id = generateId(undefined, 10);
      expect(id).toHaveLength(10);
    });

    it('should prepend prefix when provided', () => {
      const id = generateId('user');
      expect(id).toMatch(/^user_/);
    });

    it('should use default length of 21', () => {
      const id = generateId();
      expect(id).toHaveLength(21);
    });
  });

  describe('generateMessageId', () => {
    it('should generate valid message ID format', () => {
      const id = generateMessageId('example.com');
      expect(id).toMatch(/^<[a-z0-9]+\.[a-zA-Z0-9_-]+@example\.com>$/);
    });

    it('should use the provided domain', () => {
      const id = generateMessageId('mail.test.org');
      expect(id).toContain('@mail.test.org>');
    });
  });

  describe('generateSecureToken', () => {
    it('should generate token with default length', () => {
      const token = generateSecureToken();
      expect(token).toHaveLength(32);
    });

    it('should generate token with custom length', () => {
      const token = generateSecureToken(64);
      expect(token).toHaveLength(64);
    });

    it('should only contain alphanumeric characters', () => {
      const token = generateSecureToken();
      expect(token).toMatch(/^[A-Za-z0-9]+$/);
    });
  });

  describe('generateShortCode', () => {
    it('should generate code with default length of 6', () => {
      const code = generateShortCode();
      expect(code).toHaveLength(6);
    });

    it('should only contain uppercase alphanumeric (without ambiguous chars)', () => {
      const code = generateShortCode(100);
      // Should not contain O, I, 1, 0
      expect(code).not.toMatch(/[OI10]/);
      expect(code).toMatch(/^[A-HJ-NP-Z2-9]+$/);
    });
  });
});

describe('String Utilities', () => {
  describe('slugify', () => {
    it('should convert text to lowercase slug', () => {
      expect(slugify('Hello World')).toBe('hello-world');
    });

    it('should handle special characters', () => {
      expect(slugify('Hello, World!')).toBe('hello-world');
    });

    it('should handle multiple spaces', () => {
      expect(slugify('hello   world')).toBe('hello-world');
    });

    it('should handle leading and trailing hyphens', () => {
      expect(slugify('--hello--world--')).toBe('hello-world');
    });

    it('should handle empty string', () => {
      expect(slugify('')).toBe('');
    });
  });

  describe('truncate', () => {
    it('should not truncate short strings', () => {
      expect(truncate('hello', 10)).toBe('hello');
    });

    it('should truncate long strings with ellipsis', () => {
      expect(truncate('hello world', 8)).toBe('hello...');
    });

    it('should use custom suffix', () => {
      expect(truncate('hello world', 8, '…')).toBe('hello w…');
    });
  });

  describe('capitalize', () => {
    it('should capitalize first letter', () => {
      expect(capitalize('hello')).toBe('Hello');
    });

    it('should lowercase rest of string', () => {
      expect(capitalize('HELLO')).toBe('Hello');
    });
  });

  describe('titleCase', () => {
    it('should capitalize each word', () => {
      expect(titleCase('hello world')).toBe('Hello World');
    });

    it('should handle mixed case', () => {
      expect(titleCase('HELLO WORLD')).toBe('Hello World');
    });
  });

  describe('maskEmail', () => {
    it('should mask email address', () => {
      expect(maskEmail('john@example.com')).toBe('j**n@example.com');
    });

    it('should handle short local parts', () => {
      expect(maskEmail('jo@example.com')).toBe('**@example.com');
    });

    it('should handle single character', () => {
      expect(maskEmail('j@example.com')).toBe('*@example.com');
    });

    it('should return invalid emails unchanged', () => {
      expect(maskEmail('invalid')).toBe('invalid');
    });
  });

  describe('getInitials', () => {
    it('should get initials from name', () => {
      expect(getInitials('John Doe')).toBe('JD');
    });

    it('should handle single name', () => {
      expect(getInitials('John')).toBe('J');
    });

    it('should respect maxLength', () => {
      expect(getInitials('John William Doe', 2)).toBe('JW');
    });

    it('should handle empty string', () => {
      expect(getInitials('')).toBe('');
    });
  });
});

describe('Email Utilities', () => {
  describe('isValidEmail', () => {
    it('should validate correct email addresses', () => {
      expect(isValidEmail('test@example.com')).toBe(true);
      expect(isValidEmail('user.name@domain.org')).toBe(true);
      expect(isValidEmail('user+tag@example.com')).toBe(true);
    });

    it('should reject invalid email addresses', () => {
      expect(isValidEmail('invalid')).toBe(false);
      expect(isValidEmail('@domain.com')).toBe(false);
      expect(isValidEmail('user@')).toBe(false);
      expect(isValidEmail('user@domain')).toBe(false);
    });
  });

  describe('extractEmailDomain', () => {
    it('should extract domain from email', () => {
      expect(extractEmailDomain('user@example.com')).toBe('example.com');
    });

    it('should return lowercase domain', () => {
      expect(extractEmailDomain('user@EXAMPLE.COM')).toBe('example.com');
    });

    it('should return null for invalid email', () => {
      expect(extractEmailDomain('invalid')).toBeNull();
    });
  });

  describe('normalizeEmail', () => {
    it('should lowercase email', () => {
      expect(normalizeEmail('USER@EXAMPLE.COM')).toBe('user@example.com');
    });

    it('should normalize gmail addresses', () => {
      expect(normalizeEmail('user.name@gmail.com')).toBe('username@gmail.com');
      expect(normalizeEmail('user+tag@gmail.com')).toBe('user@gmail.com');
    });

    it('should handle googlemail.com', () => {
      expect(normalizeEmail('user.name@googlemail.com')).toBe('username@googlemail.com');
    });

    it('should not modify other domains', () => {
      expect(normalizeEmail('user.name@example.com')).toBe('user.name@example.com');
    });
  });

  describe('parseEmailAddress', () => {
    it('should parse simple email', () => {
      expect(parseEmailAddress('user@example.com')).toEqual({
        address: 'user@example.com',
      });
    });

    it('should parse email with display name', () => {
      expect(parseEmailAddress('John Doe <john@example.com>')).toEqual({
        address: 'john@example.com',
        name: 'John Doe',
      });
    });

    it('should parse quoted display name', () => {
      expect(parseEmailAddress('"John Doe" <john@example.com>')).toEqual({
        address: 'john@example.com',
        name: 'John Doe',
      });
    });
  });

  describe('formatEmailAddress', () => {
    it('should format email without name', () => {
      expect(formatEmailAddress('user@example.com')).toBe('user@example.com');
    });

    it('should format email with name', () => {
      expect(formatEmailAddress('user@example.com', 'John Doe')).toBe(
        '"John Doe" <user@example.com>'
      );
    });

    it('should escape quotes in name', () => {
      expect(formatEmailAddress('user@example.com', 'John "Johnny" Doe')).toBe(
        '"John \\"Johnny\\" Doe" <user@example.com>'
      );
    });
  });
});

describe('Date Utilities', () => {
  describe('toISOString', () => {
    it('should convert Date to ISO string', () => {
      const date = new Date('2024-01-15T10:30:00Z');
      expect(toISOString(date)).toBe('2024-01-15T10:30:00.000Z');
    });

    it('should handle ISO string input', () => {
      expect(toISOString('2024-01-15T10:30:00Z')).toBe('2024-01-15T10:30:00.000Z');
    });
  });

  describe('formatDate', () => {
    it('should format date with default format', () => {
      const date = new Date('2024-01-15T10:30:00Z');
      expect(formatDate(date)).toMatch(/Jan 15, 2024/);
    });

    it('should use custom format', () => {
      const date = new Date('2024-01-15T10:30:00Z');
      expect(formatDate(date, 'yyyy-MM-dd')).toBe('2024-01-15');
    });
  });

  describe('formatDateTime', () => {
    it('should format date and time', () => {
      const date = new Date('2024-01-15T10:30:00Z');
      const formatted = formatDateTime(date);
      expect(formatted).toContain('Jan 15, 2024');
    });
  });

  describe('isValidDate', () => {
    it('should return true for valid Date', () => {
      expect(isValidDate(new Date())).toBe(true);
    });

    it('should return false for invalid Date', () => {
      expect(isValidDate(new Date('invalid'))).toBe(false);
    });

    it('should return false for non-Date values', () => {
      expect(isValidDate('2024-01-15')).toBe(false);
      expect(isValidDate(null)).toBe(false);
      expect(isValidDate(123)).toBe(false);
    });
  });

  describe('addTime', () => {
    it('should add minutes', () => {
      const date = new Date('2024-01-15T10:30:00Z');
      const result = addTime(date, 30, 'minutes');
      expect(result.toISOString()).toBe('2024-01-15T11:00:00.000Z');
    });

    it('should add hours', () => {
      const date = new Date('2024-01-15T10:30:00Z');
      const result = addTime(date, 2, 'hours');
      expect(result.toISOString()).toBe('2024-01-15T12:30:00.000Z');
    });

    it('should add days', () => {
      const date = new Date('2024-01-15T10:30:00Z');
      const result = addTime(date, 5, 'days');
      expect(result.toISOString()).toBe('2024-01-20T10:30:00.000Z');
    });
  });

  describe('isExpired', () => {
    it('should return true for past dates', () => {
      const pastDate = new Date(Date.now() - 1000000);
      expect(isExpired(pastDate)).toBe(true);
    });

    it('should return false for future dates', () => {
      const futureDate = new Date(Date.now() + 1000000);
      expect(isExpired(futureDate)).toBe(false);
    });
  });

  describe('isFuture', () => {
    it('should return true for future dates', () => {
      const futureDate = new Date(Date.now() + 1000000);
      expect(isFuture(futureDate)).toBe(true);
    });

    it('should return false for past dates', () => {
      const pastDate = new Date(Date.now() - 1000000);
      expect(isFuture(pastDate)).toBe(false);
    });
  });

  describe('getTimeDifference', () => {
    it('should return seconds for short differences', () => {
      const from = new Date();
      const to = new Date(from.getTime() + 30000);
      const result = getTimeDifference(from, to);
      expect(result.unit).toBe('seconds');
      expect(result.value).toBe(30);
    });

    it('should return minutes for medium differences', () => {
      const from = new Date();
      const to = new Date(from.getTime() + 300000); // 5 minutes
      const result = getTimeDifference(from, to);
      expect(result.unit).toBe('minutes');
      expect(result.value).toBe(5);
    });

    it('should return hours for large differences', () => {
      const from = new Date();
      const to = new Date(from.getTime() + 7200000); // 2 hours
      const result = getTimeDifference(from, to);
      expect(result.unit).toBe('hours');
      expect(result.value).toBe(2);
    });

    it('should return days for very large differences', () => {
      const from = new Date();
      const to = new Date(from.getTime() + 172800000); // 2 days
      const result = getTimeDifference(from, to);
      expect(result.unit).toBe('days');
      expect(result.value).toBe(2);
    });
  });
});

describe('Number Utilities', () => {
  describe('formatBytes', () => {
    it('should format 0 bytes', () => {
      expect(formatBytes(0)).toBe('0 Bytes');
    });

    it('should format bytes', () => {
      expect(formatBytes(500)).toBe('500 Bytes');
    });

    it('should format KB', () => {
      expect(formatBytes(1024)).toBe('1 KB');
    });

    it('should format MB', () => {
      expect(formatBytes(1048576)).toBe('1 MB');
    });

    it('should format GB', () => {
      expect(formatBytes(1073741824)).toBe('1 GB');
    });

    it('should respect decimal places', () => {
      expect(formatBytes(1536, 1)).toBe('1.5 KB');
    });
  });

  describe('formatNumber', () => {
    it('should format with thousand separators', () => {
      expect(formatNumber(1234567)).toBe('1,234,567');
    });

    it('should handle small numbers', () => {
      expect(formatNumber(42)).toBe('42');
    });
  });

  describe('formatPercentage', () => {
    it('should format percentage', () => {
      expect(formatPercentage(0.75)).toBe('75.0%');
    });

    it('should respect decimal places', () => {
      expect(formatPercentage(0.333, 2)).toBe('33.30%');
    });
  });

  describe('clamp', () => {
    it('should clamp values within range', () => {
      expect(clamp(5, 0, 10)).toBe(5);
    });

    it('should clamp values below min', () => {
      expect(clamp(-5, 0, 10)).toBe(0);
    });

    it('should clamp values above max', () => {
      expect(clamp(15, 0, 10)).toBe(10);
    });
  });
});

describe('Object Utilities', () => {
  describe('deepClone', () => {
    it('should create a deep copy', () => {
      const original = { a: 1, b: { c: 2 } };
      const cloned = deepClone(original);
      expect(cloned).toEqual(original);
      expect(cloned).not.toBe(original);
      expect(cloned.b).not.toBe(original.b);
    });

    it('should handle arrays', () => {
      const original = [1, [2, 3]];
      const cloned = deepClone(original);
      expect(cloned).toEqual(original);
      expect(cloned).not.toBe(original);
    });
  });

  describe('compact', () => {
    it('should remove null and undefined values', () => {
      const obj = { a: 1, b: null, c: undefined, d: 'test' };
      expect(compact(obj)).toEqual({ a: 1, d: 'test' });
    });

    it('should keep falsy values like 0 and empty string', () => {
      const obj = { a: 0, b: '', c: false };
      expect(compact(obj)).toEqual({ a: 0, b: '', c: false });
    });
  });

  describe('pick', () => {
    it('should pick specified keys', () => {
      const obj = { a: 1, b: 2, c: 3 };
      expect(pick(obj, ['a', 'c'])).toEqual({ a: 1, c: 3 });
    });

    it('should ignore non-existent keys', () => {
      const obj = { a: 1, b: 2 };
      expect(pick(obj, ['a', 'z' as keyof typeof obj])).toEqual({ a: 1 });
    });
  });

  describe('omit', () => {
    it('should omit specified keys', () => {
      const obj = { a: 1, b: 2, c: 3 };
      expect(omit(obj, ['b'])).toEqual({ a: 1, c: 3 });
    });
  });

  describe('isEmpty', () => {
    it('should return true for empty object', () => {
      expect(isEmpty({})).toBe(true);
    });

    it('should return false for non-empty object', () => {
      expect(isEmpty({ a: 1 })).toBe(false);
    });
  });
});

describe('Array Utilities', () => {
  describe('chunk', () => {
    it('should split array into chunks', () => {
      expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    });

    it('should handle empty array', () => {
      expect(chunk([], 2)).toEqual([]);
    });

    it('should handle chunk size larger than array', () => {
      expect(chunk([1, 2], 5)).toEqual([[1, 2]]);
    });
  });

  describe('unique', () => {
    it('should remove duplicates', () => {
      expect(unique([1, 2, 2, 3, 1])).toEqual([1, 2, 3]);
    });

    it('should handle strings', () => {
      expect(unique(['a', 'b', 'a'])).toEqual(['a', 'b']);
    });
  });

  describe('uniqueBy', () => {
    it('should remove duplicates by key', () => {
      const items = [
        { id: 1, name: 'a' },
        { id: 2, name: 'b' },
        { id: 1, name: 'c' },
      ];
      expect(uniqueBy(items, 'id')).toEqual([
        { id: 1, name: 'a' },
        { id: 2, name: 'b' },
      ]);
    });
  });

  describe('groupBy', () => {
    it('should group items by key', () => {
      const items = [
        { type: 'a', value: 1 },
        { type: 'b', value: 2 },
        { type: 'a', value: 3 },
      ];
      expect(groupBy(items, 'type')).toEqual({
        a: [{ type: 'a', value: 1 }, { type: 'a', value: 3 }],
        b: [{ type: 'b', value: 2 }],
      });
    });
  });
});

describe('Async Utilities', () => {
  describe('sleep', () => {
    it('should delay execution', async () => {
      const start = Date.now();
      await sleep(50);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(45);
    });
  });

  describe('retry', () => {
    it('should return result on first success', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const result = await retry(fn);
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue('success');

      const result = await retry(fn, { initialDelay: 10 });
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should throw after max attempts', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('always fail'));

      await expect(
        retry(fn, { maxAttempts: 3, initialDelay: 10 })
      ).rejects.toThrow('always fail');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should call onRetry callback', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue('success');
      const onRetry = vi.fn();

      await retry(fn, { initialDelay: 10, onRetry });
      expect(onRetry).toHaveBeenCalledTimes(1);
    });
  });

  describe('pLimit', () => {
    it('should execute tasks with concurrency limit', async () => {
      const order: number[] = [];
      const tasks = [1, 2, 3, 4, 5].map((n) => async () => {
        await sleep(10);
        order.push(n);
        return n;
      });

      const results = await pLimit(tasks, 2);
      expect(results).toHaveLength(5);
      expect(results.sort()).toEqual([1, 2, 3, 4, 5]);
    });

    it('should handle empty task list', async () => {
      const results = await pLimit([], 2);
      expect(results).toEqual([]);
    });
  });
});
