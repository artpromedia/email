/**
 * Advanced Email Search
 * Search operators, parsing, and highlighting
 */

// ============================================================
// TYPES
// ============================================================

export interface SearchOperator {
  key: string;
  label: string;
  description: string;
  example: string;
  type: "text" | "email" | "date" | "boolean";
}

export interface ParsedSearchQuery {
  fullText?: string;
  from?: string;
  to?: string;
  subject?: string;
  body?: string;
  hasAttachment?: boolean;
  isUnread?: boolean;
  isStarred?: boolean;
  dateAfter?: Date;
  dateBefore?: Date;
  dateOn?: Date;
  label?: string;
}

export interface SearchSuggestion {
  type: "operator" | "recent" | "contact";
  value: string;
  label: string;
  description?: string;
}

// ============================================================
// SEARCH OPERATORS
// ============================================================

export const SEARCH_OPERATORS: SearchOperator[] = [
  {
    key: "from",
    label: "From",
    description: "Emails from a specific sender",
    example: "from:john@example.com",
    type: "email",
  },
  {
    key: "to",
    label: "To",
    description: "Emails sent to a specific recipient",
    example: "to:jane@example.com",
    type: "email",
  },
  {
    key: "subject",
    label: "Subject",
    description: "Search in email subject",
    example: "subject:meeting",
    type: "text",
  },
  {
    key: "body",
    label: "Body",
    description: "Search in email body",
    example: "body:proposal",
    type: "text",
  },
  {
    key: "has",
    label: "Has",
    description: "Has attachment",
    example: "has:attachment",
    type: "text",
  },
  {
    key: "is",
    label: "Is",
    description: "Email status (unread, starred, important)",
    example: "is:unread",
    type: "text",
  },
  {
    key: "after",
    label: "After",
    description: "Emails after a date",
    example: "after:2025/01/01",
    type: "date",
  },
  {
    key: "before",
    label: "Before",
    description: "Emails before a date",
    example: "before:2026/01/01",
    type: "date",
  },
  {
    key: "on",
    label: "On",
    description: "Emails on a specific date",
    example: "on:2025/12/25",
    type: "date",
  },
  {
    key: "label",
    label: "Label",
    description: "Emails with a specific label",
    example: "label:important",
    type: "text",
  },
];

// ============================================================
// SEARCH QUERY PARSER
// ============================================================

/**
 * Parse search query with operators into structured format
 * Supports: from:, to:, subject:, body:, has:, is:, after:, before:, on:, label:
 */
export function parseSearchQuery(query: string): ParsedSearchQuery {
  const result: ParsedSearchQuery = {};
  let remainingText = query.trim();

  // Pattern to match operators: operator:value or operator:"value with spaces"
  const operatorPattern = /(\w+):(?:"([^"]+)"|(\S+))/g;

  let match;
  const matches: { index: number; length: number }[] = [];

  while ((match = operatorPattern.exec(query)) !== null) {
    const operator = match[1]?.toLowerCase();
    const value = match[2] ?? match[3];

    if (!operator || !value) continue;

    matches.push({ index: match.index, length: match[0].length });

    switch (operator) {
      case "from":
        result.from = value;
        break;
      case "to":
        result.to = value;
        break;
      case "subject":
        result.subject = value;
        break;
      case "body":
        result.body = value;
        break;
      case "has":
        if (value === "attachment") {
          result.hasAttachment = true;
        }
        break;
      case "is":
        if (value === "unread") {
          result.isUnread = true;
        } else if (value === "starred") {
          result.isStarred = true;
        }
        break;
      case "after":
        result.dateAfter = parseSearchDate(value);
        break;
      case "before":
        result.dateBefore = parseSearchDate(value);
        break;
      case "on":
        result.dateOn = parseSearchDate(value);
        break;
      case "label":
        result.label = value;
        break;
    }
  }

  // Remove matched operators from the query to get remaining full-text search
  if (matches.length > 0) {
    // Sort matches by index in reverse order
    matches.sort((a, b) => b.index - a.index);

    // Remove each match from the string
    matches.forEach((m) => {
      remainingText =
        remainingText.substring(0, m.index) + remainingText.substring(m.index + m.length);
    });
  }

  // Trim and set remaining text as full-text search
  remainingText = remainingText.trim();
  if (remainingText) {
    result.fullText = remainingText;
  }

  return result;
}

/**
 * Parse date from search query
 * Supports formats: YYYY/MM/DD, YYYY-MM-DD, relative dates (today, yesterday, 7d)
 */
function parseSearchDate(dateStr: string): Date | undefined {
  // Relative dates
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (dateStr === "today") {
    return today;
  }

  if (dateStr === "yesterday") {
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday;
  }

  // Relative days: 7d (7 days ago)
  const daysMatch = /^(\d+)d$/.exec(dateStr);
  if (daysMatch) {
    const days = Number.parseInt(daysMatch[1] ?? "0", 10);
    const date = new Date(today);
    date.setDate(date.getDate() - days);
    return date;
  }

  // Absolute dates: YYYY/MM/DD or YYYY-MM-DD
  const dateMatch = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/.exec(dateStr);
  if (dateMatch) {
    const year = Number.parseInt(dateMatch[1] ?? "0", 10);
    const month = Number.parseInt(dateMatch[2] ?? "0", 10) - 1; // 0-indexed
    const day = Number.parseInt(dateMatch[3] ?? "0", 10);
    return new Date(year, month, day);
  }

  return undefined;
}

/**
 * Convert parsed query back to string format
 */
export function stringifySearchQuery(parsed: ParsedSearchQuery): string {
  const parts: string[] = [];

  if (parsed.from) parts.push(`from:${parsed.from}`);
  if (parsed.to) parts.push(`to:${parsed.to}`);
  if (parsed.subject) parts.push(`subject:"${parsed.subject}"`);
  if (parsed.body) parts.push(`body:"${parsed.body}"`);
  if (parsed.hasAttachment) parts.push("has:attachment");
  if (parsed.isUnread) parts.push("is:unread");
  if (parsed.isStarred) parts.push("is:starred");
  if (parsed.dateAfter) parts.push(`after:${formatSearchDate(parsed.dateAfter)}`);
  if (parsed.dateBefore) parts.push(`before:${formatSearchDate(parsed.dateBefore)}`);
  if (parsed.dateOn) parts.push(`on:${formatSearchDate(parsed.dateOn)}`);
  if (parsed.label) parts.push(`label:${parsed.label}`);
  if (parsed.fullText) parts.push(parsed.fullText);

  return parts.join(" ");
}

function formatSearchDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}/${month}/${day}`;
}

// ============================================================
// SEARCH SUGGESTIONS
// ============================================================

/**
 * Get search suggestions based on current input
 */
export function getSearchSuggestions(
  query: string,
  recentSearches: string[] = [],
  contacts: { email: string; name?: string }[] = []
): SearchSuggestion[] {
  const suggestions: SearchSuggestion[] = [];
  const lowerQuery = query.toLowerCase().trim();

  // If empty, show recent searches
  if (!lowerQuery) {
    recentSearches.slice(0, 5).forEach((search) => {
      suggestions.push({
        type: "recent",
        value: search,
        label: search,
        description: "Recent search",
      });
    });
    return suggestions;
  }

  // Check if typing an operator
  const lastToken = lowerQuery.split(/\s+/).pop() ?? "";

  // Operator suggestions
  if (lastToken && !lastToken.includes(":")) {
    SEARCH_OPERATORS.forEach((op) => {
      if (op.key.startsWith(lastToken) || op.label.toLowerCase().startsWith(lastToken)) {
        suggestions.push({
          type: "operator",
          value: `${op.key}:`,
          label: `${op.key}:`,
          description: op.description,
        });
      }
    });
  }

  // Contact suggestions for from: and to: operators
  const fromMatch = /from:(\S*)$/.exec(lowerQuery);
  const toMatch = /to:(\S*)$/.exec(lowerQuery);

  if (fromMatch || toMatch) {
    const searchTerm = (fromMatch?.[1] ?? toMatch?.[1] ?? "").toLowerCase();
    contacts
      .filter(
        (contact) =>
          contact.email.toLowerCase().includes(searchTerm) ||
          contact.name?.toLowerCase().includes(searchTerm)
      )
      .slice(0, 5)
      .forEach((contact) => {
        suggestions.push({
          type: "contact",
          value: contact.email,
          label: contact.name ? `${contact.name} <${contact.email}>` : contact.email,
          description: fromMatch ? "From this sender" : "To this recipient",
        });
      });
  }

  return suggestions;
}

// ============================================================
// SEARCH RESULT HIGHLIGHTING
// ============================================================

/**
 * Highlight search terms in text
 */
export function highlightSearchTerms(text: string, searchQuery: string): string {
  if (!searchQuery.trim()) return text;

  const parsed = parseSearchQuery(searchQuery);
  const terms: string[] = [];

  // Collect all search terms
  if (parsed.fullText) terms.push(parsed.fullText);
  if (parsed.subject) terms.push(parsed.subject);
  if (parsed.body) terms.push(parsed.body);

  if (terms.length === 0) return text;

  // Escape special regex characters
  const escapedTerms = terms.map((term) => term.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`));

  // Create regex pattern
  const pattern = new RegExp(`(${escapedTerms.join("|")})`, "gi");

  // Replace matches with highlighted version
  return text.replace(pattern, "<mark>$1</mark>");
}

/**
 * Extract highlighted snippets from text
 */
export function extractSearchSnippet(text: string, searchQuery: string, maxLength = 150): string {
  if (!searchQuery.trim()) {
    return text.substring(0, maxLength) + (text.length > maxLength ? "..." : "");
  }

  const parsed = parseSearchQuery(searchQuery);
  const terms: string[] = [];

  if (parsed.fullText) terms.push(parsed.fullText);
  if (parsed.body) terms.push(parsed.body);

  if (terms.length === 0) {
    return text.substring(0, maxLength) + (text.length > maxLength ? "..." : "");
  }

  // Find first occurrence of any search term
  let bestIndex = -1;
  let bestTerm = "";

  terms.forEach((term) => {
    const index = text.toLowerCase().indexOf(term.toLowerCase());
    if (index !== -1 && (bestIndex === -1 || index < bestIndex)) {
      bestIndex = index;
      bestTerm = term;
    }
  });

  if (bestIndex === -1) {
    return text.substring(0, maxLength) + (text.length > maxLength ? "..." : "");
  }

  // Extract snippet around the match
  const halfLength = Math.floor(maxLength / 2);
  let start = Math.max(0, bestIndex - halfLength);
  let end = Math.min(text.length, bestIndex + bestTerm.length + halfLength);

  // Adjust to not cut words
  if (start > 0) {
    const spaceIndex = text.indexOf(" ", start);
    if (spaceIndex !== -1 && spaceIndex < start + 20) {
      start = spaceIndex + 1;
    }
  }

  if (end < text.length) {
    const spaceIndex = text.lastIndexOf(" ", end);
    if (spaceIndex !== -1 && spaceIndex > end - 20) {
      end = spaceIndex;
    }
  }

  const prefix = start > 0 ? "..." : "";
  const suffix = end < text.length ? "..." : "";

  return prefix + text.substring(start, end) + suffix;
}
