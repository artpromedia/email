/**
 * Email Search Tests
 * Tests for search query parsing, operators, and suggestions
 */

import {
  parseSearchQuery,
  stringifySearchQuery,
  getSearchSuggestions,
  highlightSearchTerms,
  extractSearchSnippet,
  SEARCH_OPERATORS,
  type ParsedSearchQuery,
} from "./search";

describe("parseSearchQuery", () => {
  describe("basic text search", () => {
    it("parses plain text query", () => {
      const result = parseSearchQuery("hello world");
      expect(result.fullText).toBe("hello world");
    });

    it("handles empty query", () => {
      const result = parseSearchQuery("");
      expect(result.fullText).toBeUndefined();
    });

    it("trims whitespace", () => {
      const result = parseSearchQuery("  hello  ");
      expect(result.fullText).toBe("hello");
    });
  });

  describe("from: operator", () => {
    it("parses from operator", () => {
      const result = parseSearchQuery("from:john@example.com");
      expect(result.from).toBe("john@example.com");
    });

    it("parses from with quoted value", () => {
      const result = parseSearchQuery('from:"john doe"');
      expect(result.from).toBe("john doe");
    });

    it("handles mixed from and text", () => {
      const result = parseSearchQuery("from:john@example.com meeting");
      expect(result.from).toBe("john@example.com");
      expect(result.fullText).toBe("meeting");
    });
  });

  describe("to: operator", () => {
    it("parses to operator", () => {
      const result = parseSearchQuery("to:jane@example.com");
      expect(result.to).toBe("jane@example.com");
    });
  });

  describe("subject: operator", () => {
    it("parses subject operator", () => {
      const result = parseSearchQuery("subject:meeting");
      expect(result.subject).toBe("meeting");
    });

    it("parses quoted subject", () => {
      const result = parseSearchQuery('subject:"Q4 Report"');
      expect(result.subject).toBe("Q4 Report");
    });
  });

  describe("body: operator", () => {
    it("parses body operator", () => {
      const result = parseSearchQuery("body:proposal");
      expect(result.body).toBe("proposal");
    });
  });

  describe("has: operator", () => {
    it("parses has:attachment", () => {
      const result = parseSearchQuery("has:attachment");
      expect(result.hasAttachment).toBe(true);
    });

    it("ignores invalid has values", () => {
      const result = parseSearchQuery("has:invalid");
      expect(result.hasAttachment).toBeUndefined();
    });
  });

  describe("is: operator", () => {
    it("parses is:unread", () => {
      const result = parseSearchQuery("is:unread");
      expect(result.isUnread).toBe(true);
    });

    it("parses is:starred", () => {
      const result = parseSearchQuery("is:starred");
      expect(result.isStarred).toBe(true);
    });
  });

  describe("date operators", () => {
    it("parses after: with date", () => {
      const result = parseSearchQuery("after:2025/01/15");
      expect(result.dateAfter).toBeInstanceOf(Date);
      expect(result.dateAfter?.getFullYear()).toBe(2025);
      expect(result.dateAfter?.getMonth()).toBe(0); // January
      expect(result.dateAfter?.getDate()).toBe(15);
    });

    it("parses before: with date", () => {
      const result = parseSearchQuery("before:2026/12/31");
      expect(result.dateBefore).toBeInstanceOf(Date);
    });

    it("parses on: with date", () => {
      const result = parseSearchQuery("on:2025/06/15");
      expect(result.dateOn).toBeInstanceOf(Date);
    });

    it("parses relative date: today", () => {
      const result = parseSearchQuery("after:today");
      expect(result.dateAfter).toBeInstanceOf(Date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      expect(result.dateAfter?.toDateString()).toBe(today.toDateString());
    });

    it("parses relative date: yesterday", () => {
      const result = parseSearchQuery("on:yesterday");
      expect(result.dateOn).toBeInstanceOf(Date);
    });

    it("parses relative days: 7d", () => {
      const result = parseSearchQuery("after:7d");
      expect(result.dateAfter).toBeInstanceOf(Date);
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      sevenDaysAgo.setHours(0, 0, 0, 0);
      expect(result.dateAfter?.toDateString()).toBe(sevenDaysAgo.toDateString());
    });
  });

  describe("label: operator", () => {
    it("parses label operator", () => {
      const result = parseSearchQuery("label:important");
      expect(result.label).toBe("important");
    });
  });

  describe("complex queries", () => {
    it("parses multiple operators", () => {
      const result = parseSearchQuery("from:john@example.com subject:meeting has:attachment");
      expect(result.from).toBe("john@example.com");
      expect(result.subject).toBe("meeting");
      expect(result.hasAttachment).toBe(true);
    });

    it("parses operators with free text", () => {
      const result = parseSearchQuery("from:john subject:report quarterly budget review");
      expect(result.from).toBe("john");
      expect(result.subject).toBe("report");
      expect(result.fullText).toBe("quarterly budget review");
    });

    it("handles real-world query", () => {
      const result = parseSearchQuery(
        'from:boss@company.com subject:"Q4 Report" after:2025/01/01 is:unread'
      );
      expect(result.from).toBe("boss@company.com");
      expect(result.subject).toBe("Q4 Report");
      expect(result.dateAfter).toBeInstanceOf(Date);
      expect(result.isUnread).toBe(true);
    });
  });
});

describe("stringifySearchQuery", () => {
  it("converts simple query to string", () => {
    const query: ParsedSearchQuery = { fullText: "hello" };
    expect(stringifySearchQuery(query)).toBe("hello");
  });

  it("converts from operator to string", () => {
    const query: ParsedSearchQuery = { from: "john@example.com" };
    expect(stringifySearchQuery(query)).toBe("from:john@example.com");
  });

  it("converts complex query to string", () => {
    const query: ParsedSearchQuery = {
      from: "john@example.com",
      subject: "meeting",
      isUnread: true,
      fullText: "budget",
    };
    const result = stringifySearchQuery(query);
    expect(result).toContain("from:john@example.com");
    // Subject gets quoted in stringifySearchQuery
    expect(result).toContain('subject:"meeting"');
    expect(result).toContain("is:unread");
    expect(result).toContain("budget");
  });

  it("roundtrips simple queries", () => {
    const original = "from:john@example.com subject:report";
    const parsed = parseSearchQuery(original);
    const stringified = stringifySearchQuery(parsed);
    const reparsed = parseSearchQuery(stringified);

    expect(reparsed.from).toBe(parsed.from);
    expect(reparsed.subject).toBe(parsed.subject);
  });
});

describe("getSearchSuggestions", () => {
  const recentSearches = ["meeting notes", "from:boss", "budget report"];
  const contacts = [
    { email: "john@example.com", name: "John Doe" },
    { email: "jane@example.com", name: "Jane Smith" },
  ];

  it("returns operator suggestions for empty query", () => {
    const suggestions = getSearchSuggestions("", recentSearches, contacts);
    expect(suggestions.some((s) => s.type === "recent")).toBe(true);
  });

  it("returns operator suggestions when typing operator", () => {
    const suggestions = getSearchSuggestions("fro", recentSearches, contacts);
    expect(suggestions.some((s) => s.value.startsWith("from:"))).toBe(true);
  });

  it("returns contact suggestions for from:", () => {
    const suggestions = getSearchSuggestions("from:j", recentSearches, contacts);
    expect(
      suggestions.some((s) => s.type === "contact" && s.value.includes("john@example.com"))
    ).toBe(true);
  });

  it("returns recent searches for empty query", () => {
    // Current implementation shows recent searches only for empty queries
    const suggestions = getSearchSuggestions("", recentSearches, contacts);
    expect(suggestions.some((s) => s.type === "recent" && s.value.includes("meeting"))).toBe(true);
  });
});

describe("highlightSearchTerms", () => {
  it("highlights matching text", () => {
    const result = highlightSearchTerms("This is a meeting about the budget", "meeting");
    expect(result).toContain("<mark>");
    expect(result).toContain("meeting");
  });

  it("highlights multiple occurrences", () => {
    const result = highlightSearchTerms("The meeting was about meeting notes", "meeting");
    const markCount = (result.match(/<mark>/g) ?? []).length;
    expect(markCount).toBe(2);
  });

  it("handles case insensitive matching", () => {
    const result = highlightSearchTerms("Meeting with MEETING", "meeting");
    const markCount = (result.match(/<mark>/g) ?? []).length;
    expect(markCount).toBe(2);
  });

  it("returns original text if no match", () => {
    const result = highlightSearchTerms("Hello world", "xyz");
    expect(result).toBe("Hello world");
  });
});

describe("extractSearchSnippet", () => {
  const longText =
    "Lorem ipsum dolor sit amet, consectetur adipiscing elit. " +
    "The important meeting about budget is scheduled for tomorrow. " +
    "Please review the documents before attending.";

  it("extracts snippet around search term", () => {
    const snippet = extractSearchSnippet(longText, "meeting", 50);
    expect(snippet).toContain("meeting");
    expect(snippet.length).toBeLessThanOrEqual(100 + "...".length * 2);
  });

  it("returns beginning if no match", () => {
    const snippet = extractSearchSnippet(longText, "xyz", 50);
    expect(snippet).toContain("Lorem");
  });

  it("handles short text", () => {
    const shortText = "Hello world";
    const snippet = extractSearchSnippet(shortText, "Hello", 50);
    expect(snippet).toBe(shortText);
  });
});

describe("SEARCH_OPERATORS", () => {
  it("has all required operators", () => {
    const keys = SEARCH_OPERATORS.map((op) => op.key);
    expect(keys).toContain("from");
    expect(keys).toContain("to");
    expect(keys).toContain("subject");
    expect(keys).toContain("body");
    expect(keys).toContain("has");
    expect(keys).toContain("is");
    expect(keys).toContain("after");
    expect(keys).toContain("before");
    expect(keys).toContain("on");
    expect(keys).toContain("label");
  });

  it("each operator has required properties", () => {
    SEARCH_OPERATORS.forEach((op) => {
      expect(op.key).toBeDefined();
      expect(op.label).toBeDefined();
      expect(op.description).toBeDefined();
      expect(op.example).toBeDefined();
      expect(op.type).toBeDefined();
    });
  });
});
