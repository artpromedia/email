"use client";

/**
 * Advanced Search Bar Component
 * Search bar with operator suggestions and autocomplete
 */

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Search, X, HelpCircle, Clock } from "lucide-react";
import { cn } from "@email/ui";

import {
  parseSearchQuery,
  getSearchSuggestions,
  SEARCH_OPERATORS,
  type SearchSuggestion,
} from "@/lib/mail/search";

// ============================================================
// TYPES
// ============================================================

interface AdvancedSearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
  placeholder?: string;
  recentSearches?: string[];
  contacts?: { email: string; name?: string }[];
  className?: string;
}

// ============================================================
// SEARCH HELP PANEL
// ============================================================

interface SearchHelpPanelProps {
  onClose: () => void;
  onInsertOperator: (operator: string) => void;
}

function SearchHelpPanel({ onClose, onInsertOperator }: Readonly<SearchHelpPanelProps>) {
  return (
    <div className="absolute right-0 top-full z-50 mt-2 w-96 rounded-lg border border-neutral-200 bg-white p-4 shadow-lg dark:border-neutral-700 dark:bg-neutral-800">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">Search Operators</h3>
        <button
          onClick={onClose}
          className="rounded p-1 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700"
          type="button"
          aria-label="Close help"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-2">
        {SEARCH_OPERATORS.map((op) => (
          <button
            key={op.key}
            onClick={() => {
              onInsertOperator(op.key);
              onClose();
            }}
            className="flex w-full items-start gap-2 rounded p-2 text-left hover:bg-neutral-100 dark:hover:bg-neutral-700"
            type="button"
          >
            <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-xs text-blue-600 dark:bg-neutral-700 dark:text-blue-400">
              {op.key}:
            </code>
            <div className="flex-1">
              <div className="text-sm font-medium text-neutral-900 dark:text-white">{op.label}</div>
              <div className="text-xs text-neutral-500 dark:text-neutral-400">{op.description}</div>
              <div className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">
                e.g., {op.example}
              </div>
            </div>
          </button>
        ))}
      </div>

      <div className="mt-3 border-t border-neutral-200 pt-3 text-xs text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
        <p>
          <strong>Tip:</strong> Combine operators for advanced searches. Use quotes for phrases with
          spaces.
        </p>
        <p className="mt-1">Example: from:john subject:"Q4 report" after:2025/12/01</p>
      </div>
    </div>
  );
}

// ============================================================
// SUGGESTIONS DROPDOWN
// ============================================================

interface SuggestionsDropdownProps {
  suggestions: SearchSuggestion[];
  selectedIndex: number;
  onSelect: (suggestion: SearchSuggestion) => void;
  onMouseEnter: (index: number) => void;
}

function SuggestionsDropdown({
  suggestions,
  selectedIndex,
  onSelect,
  onMouseEnter,
}: Readonly<SuggestionsDropdownProps>) {
  if (suggestions.length === 0) return null;

  const getIcon = (type: SearchSuggestion["type"]) => {
    switch (type) {
      case "recent":
        return <Clock className="h-4 w-4" />;
      case "contact":
        return <div className="h-4 w-4 rounded-full bg-blue-500" />;
      case "operator":
        return <Search className="h-4 w-4" />;
    }
  };

  return (
    <div className="absolute left-0 top-full z-50 mt-1 w-full rounded-lg border border-neutral-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-800">
      <ul className="max-h-64 overflow-auto py-1">
        {suggestions.map((suggestion, index) => (
          <li key={`${suggestion.type}-${suggestion.value}-${index}`}>
            <button
              onClick={() => onSelect(suggestion)}
              onMouseEnter={() => onMouseEnter(index)}
              className={cn(
                "flex w-full items-start gap-3 px-3 py-2 text-left transition-colors",
                index === selectedIndex
                  ? "bg-blue-50 dark:bg-blue-900/20"
                  : "hover:bg-neutral-50 dark:hover:bg-neutral-700/50"
              )}
              type="button"
            >
              <div className="mt-0.5 text-neutral-400 dark:text-neutral-500">
                {getIcon(suggestion.type)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-neutral-900 dark:text-white">
                  {suggestion.label}
                </div>
                {suggestion.description && (
                  <div className="text-xs text-neutral-500 dark:text-neutral-400">
                    {suggestion.description}
                  </div>
                )}
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export function AdvancedSearchBar({
  value,
  onChange,
  onClear,
  placeholder = "Search emails... (? for help)",
  recentSearches = [],
  contacts = [],
  className,
}: Readonly<AdvancedSearchBarProps>) {
  const [showHelp, setShowHelp] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Get suggestions based on current input
  const suggestions = useMemo(
    () => getSearchSuggestions(value, recentSearches, contacts),
    [value, recentSearches, contacts]
  );

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowHelp(false);
        setShowSuggestions(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Handle input focus
  const handleFocus = useCallback(() => {
    setShowSuggestions(true);
    setSelectedSuggestionIndex(0);
  }, []);

  // Handle input blur
  const handleBlur = useCallback(() => {
    // Delay to allow click events on suggestions
    setTimeout(() => {
      setShowSuggestions(false);
    }, 200);
  }, []);

  // Handle input change
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.value);
      setShowSuggestions(true);
      setSelectedSuggestionIndex(0);
    },
    [onChange]
  );

  // Handle suggestion selection
  const handleSelectSuggestion = useCallback(
    (suggestion: SearchSuggestion) => {
      if (suggestion.type === "recent") {
        onChange(suggestion.value);
      } else if (suggestion.type === "operator") {
        // Insert operator at cursor or append
        const input = inputRef.current;
        if (input) {
          const cursorPos = input.selectionStart ?? value.length;
          const before = value.substring(0, cursorPos);
          const after = value.substring(cursorPos);

          // Check if we're completing an existing operator
          const lastToken = before.split(/\s+/).pop() ?? "";
          if (lastToken && !lastToken.includes(":")) {
            // Replace the partial token
            const newBefore = before.substring(0, before.length - lastToken.length);
            onChange(newBefore + suggestion.value + after);
          } else {
            // Append operator
            onChange(before + (before.endsWith(" ") ? "" : " ") + suggestion.value + after);
          }

          // Focus back to input
          setTimeout(() => input.focus(), 0);
        }
      } else {
        // Contact type
        const fromMatch = /from:(\S*)$/.exec(value);
        const toMatch = /to:(\S*)$/.exec(value);

        if (fromMatch) {
          onChange(value.replace(/from:\S*$/, `from:${suggestion.value} `));
        } else if (toMatch) {
          onChange(value.replace(/to:\S*$/, `to:${suggestion.value} `));
        }

        setTimeout(() => inputRef.current?.focus(), 0);
      }

      setShowSuggestions(false);
    },
    [value, onChange]
  );

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!showSuggestions || suggestions.length === 0) {
        // Show help with ?
        if (e.key === "?") {
          e.preventDefault();
          setShowHelp(!showHelp);
        }
        return;
      }

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedSuggestionIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : prev));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedSuggestionIndex((prev) => (prev > 0 ? prev - 1 : 0));
          break;
        case "Enter": {
          e.preventDefault();
          const selectedSuggestion = suggestions[selectedSuggestionIndex];
          if (selectedSuggestion) {
            handleSelectSuggestion(selectedSuggestion);
          }
          break;
        }
        case "Escape":
          e.preventDefault();
          setShowSuggestions(false);
          break;
      }
    },
    [showSuggestions, suggestions, selectedSuggestionIndex, showHelp, handleSelectSuggestion]
  );

  // Insert operator from help panel
  const handleInsertOperator = useCallback(
    (operator: string) => {
      const newValue = `${value + (value && !value.endsWith(" ") ? " " : "") + operator}:`;
      onChange(newValue);
      inputRef.current?.focus();
    },
    [value, onChange]
  );

  // Parse current query to show active filters
  const parsedQuery = useMemo(() => parseSearchQuery(value), [value]);
  const hasFilters = Object.keys(parsedQuery).length > 0 && !parsedQuery.fullText;

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
        <input
          ref={inputRef}
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          data-search-input
          className={cn(
            "w-full rounded-lg py-2 pl-9 pr-20 text-sm",
            "bg-neutral-100 dark:bg-neutral-800",
            "border border-transparent",
            "focus:border-blue-500 focus:bg-white focus:outline-none dark:focus:bg-neutral-900",
            "text-neutral-900 placeholder-neutral-500 dark:text-white"
          )}
        />

        {/* Action buttons */}
        <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
          {value && (
            <button
              onClick={onClear}
              className="rounded p-1 text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700"
              type="button"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={() => setShowHelp(!showHelp)}
            className={cn(
              "rounded p-1 text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700",
              showHelp && "bg-neutral-200 dark:bg-neutral-700"
            )}
            type="button"
            aria-label="Search help"
          >
            <HelpCircle className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Active filters display */}
      {hasFilters && (
        <div className="mt-2 flex flex-wrap gap-2">
          {parsedQuery.from && (
            <span className="inline-flex items-center gap-1 rounded bg-blue-100 px-2 py-1 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
              from:{parsedQuery.from}
            </span>
          )}
          {parsedQuery.to && (
            <span className="inline-flex items-center gap-1 rounded bg-blue-100 px-2 py-1 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
              to:{parsedQuery.to}
            </span>
          )}
          {parsedQuery.subject && (
            <span className="inline-flex items-center gap-1 rounded bg-blue-100 px-2 py-1 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
              subject:&quot;{parsedQuery.subject}&quot;
            </span>
          )}
          {parsedQuery.hasAttachment && (
            <span className="inline-flex items-center gap-1 rounded bg-blue-100 px-2 py-1 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
              has:attachment
            </span>
          )}
          {parsedQuery.isUnread && (
            <span className="inline-flex items-center gap-1 rounded bg-blue-100 px-2 py-1 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
              is:unread
            </span>
          )}
          {parsedQuery.isStarred && (
            <span className="inline-flex items-center gap-1 rounded bg-blue-100 px-2 py-1 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
              is:starred
            </span>
          )}
        </div>
      )}

      {/* Suggestions dropdown */}
      {showSuggestions && suggestions.length > 0 && (
        <SuggestionsDropdown
          suggestions={suggestions}
          selectedIndex={selectedSuggestionIndex}
          onSelect={handleSelectSuggestion}
          onMouseEnter={setSelectedSuggestionIndex}
        />
      )}

      {/* Help panel */}
      {showHelp && (
        <SearchHelpPanel
          onClose={() => setShowHelp(false)}
          onInsertOperator={handleInsertOperator}
        />
      )}
    </div>
  );
}
