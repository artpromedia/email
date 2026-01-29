"use client";

/**
 * Domain Filter Toolbar Component
 * Quick filter chips and view mode selector for multi-domain inbox
 */

import { useMemo, useCallback } from "react";
import { SlidersHorizontal, ChevronDown, Check, Filter, X } from "lucide-react";
import { cn } from "@email/ui";

import { useMailStore, type ViewPreferences, type Domain } from "@/lib/mail";

// ============================================================
// DOMAIN CHIP COMPONENT
// ============================================================

interface DomainChipProps {
  domain: string;
  color: string;
  unreadCount: number;
  isActive: boolean;
  onClick: () => void;
}

function DomainChip({ domain, color, unreadCount, isActive, onClick }: DomainChipProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium transition-all",
        "border",
        isActive
          ? "border-opacity-50 bg-opacity-15"
          : "border-neutral-200 bg-transparent hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
      )}
      style={
        isActive
          ? {
              backgroundColor: `${color}15`,
              borderColor: color,
              color,
            }
          : undefined
      }
    >
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
      <span className={cn(!isActive && "text-neutral-700 dark:text-neutral-300")}>{domain}</span>
      {unreadCount > 0 && (
        <span
          className={cn(
            "min-w-[18px] rounded-full px-1.5 py-0.5 text-center text-xs",
            isActive
              ? "bg-white/30"
              : "bg-neutral-200 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300"
          )}
        >
          {unreadCount}
        </span>
      )}
    </button>
  );
}

// ============================================================
// VIEW MODE DROPDOWN
// ============================================================

interface ViewModeDropdownProps {
  viewPreferences: ViewPreferences;
  onViewChange: (prefs: Partial<ViewPreferences>) => void;
}

function ViewModeDropdown({ viewPreferences, onViewChange }: ViewModeDropdownProps) {
  return (
    <div className="group relative">
      <button className="inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-neutral-600 transition-colors hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800">
        <SlidersHorizontal className="h-4 w-4" />
        <span>View</span>
        <ChevronDown className="h-3 w-3" />
      </button>

      {/* Dropdown Menu */}
      <div className="invisible absolute right-0 top-full z-50 mt-1 w-56 rounded-lg border border-neutral-200 bg-white py-2 opacity-0 shadow-lg transition-all group-hover:visible group-hover:opacity-100 dark:border-neutral-700 dark:bg-neutral-800">
        {/* Density */}
        <div className="px-3 py-1.5 text-xs font-medium uppercase tracking-wider text-neutral-500">
          Density
        </div>
        {(["comfortable", "compact", "cozy"] as const).map((density) => (
          <button
            key={density}
            onClick={() => onViewChange({ density })}
            className={cn(
              "flex w-full items-center justify-between px-3 py-2 text-sm",
              "hover:bg-neutral-100 dark:hover:bg-neutral-700",
              viewPreferences.density === density
                ? "text-blue-600 dark:text-blue-400"
                : "text-neutral-700 dark:text-neutral-300"
            )}
          >
            <span className="capitalize">{density}</span>
            {viewPreferences.density === density && <Check className="h-4 w-4" />}
          </button>
        ))}

        <div className="my-2 border-t border-neutral-200 dark:border-neutral-700" />

        {/* Preview Pane */}
        <div className="px-3 py-1.5 text-xs font-medium uppercase tracking-wider text-neutral-500">
          Preview Pane
        </div>
        {(["right", "bottom", "none"] as const).map((pane) => (
          <button
            key={pane}
            onClick={() => onViewChange({ previewPane: pane })}
            className={cn(
              "flex w-full items-center justify-between px-3 py-2 text-sm",
              "hover:bg-neutral-100 dark:hover:bg-neutral-700",
              viewPreferences.previewPane === pane
                ? "text-blue-600 dark:text-blue-400"
                : "text-neutral-700 dark:text-neutral-300"
            )}
          >
            <span className="capitalize">{pane === "none" ? "Hidden" : pane}</span>
            {viewPreferences.previewPane === pane && <Check className="h-4 w-4" />}
          </button>
        ))}

        <div className="my-2 border-t border-neutral-200 dark:border-neutral-700" />

        {/* Conversation Grouping */}
        <button
          onClick={() =>
            onViewChange({ groupByConversation: !viewPreferences.groupByConversation })
          }
          className="flex w-full items-center justify-between px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-700"
        >
          <span>Group by conversation</span>
          {viewPreferences.groupByConversation && <Check className="h-4 w-4 text-blue-600" />}
        </button>

        {/* Unread Only */}
        <button
          onClick={() => onViewChange({ showUnreadOnly: !viewPreferences.showUnreadOnly })}
          className="flex w-full items-center justify-between px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-700"
        >
          <span>Show unread only</span>
          {viewPreferences.showUnreadOnly && <Check className="h-4 w-4 text-blue-600" />}
        </button>
      </div>
    </div>
  );
}

// ============================================================
// MAIN TOOLBAR COMPONENT
// ============================================================

interface DomainFilterToolbarProps {
  className?: string;
}

export function DomainFilterToolbar({ className }: DomainFilterToolbarProps) {
  const { domains, activeDomain, viewPreferences, setActiveDomain, setViewPreferences } =
    useMailStore();

  // Calculate total unread
  const totalUnread = useMemo(
    () => domains.reduce((sum: number, d: Domain) => sum + d.unreadCount, 0),
    [domains]
  );

  // Active filters
  const activeFilters = useMemo(() => {
    const filters: string[] = [];
    if (viewPreferences.showUnreadOnly) filters.push("Unread only");
    if (viewPreferences.groupByConversation) filters.push("Conversations");
    return filters;
  }, [viewPreferences]);

  // Handlers
  const handleDomainClick = useCallback(
    (domainId: string) => {
      setActiveDomain(activeDomain === domainId ? "all" : domainId);
    },
    [activeDomain, setActiveDomain]
  );

  const handleAllClick = useCallback(() => {
    setActiveDomain("all");
  }, [setActiveDomain]);

  const clearFilter = useCallback(
    (filter: string) => {
      if (filter === "Unread only") {
        setViewPreferences({ showUnreadOnly: false });
      } else if (filter === "Conversations") {
        setViewPreferences({ groupByConversation: false });
      }
    },
    [setViewPreferences]
  );

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 bg-white px-4 py-2 dark:bg-neutral-900",
        "border-b border-neutral-200 dark:border-neutral-700",
        className
      )}
    >
      {/* "All" Chip */}
      <button
        onClick={handleAllClick}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium transition-all",
          activeDomain === "all"
            ? "border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900"
            : "border-neutral-200 bg-transparent text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
        )}
      >
        <span>All</span>
        {totalUnread > 0 && (
          <span
            className={cn(
              "min-w-[18px] rounded-full px-1.5 py-0.5 text-center text-xs",
              activeDomain === "all"
                ? "bg-white/20 dark:bg-neutral-900/20"
                : "bg-neutral-200 dark:bg-neutral-700"
            )}
          >
            {totalUnread}
          </span>
        )}
      </button>

      {/* Domain Chips */}
      {domains.map((domain: Domain) => (
        <DomainChip
          key={domain.id}
          domain={domain.domain}
          color={domain.color}
          unreadCount={domain.unreadCount}
          isActive={activeDomain === domain.id}
          onClick={() => handleDomainClick(domain.id)}
        />
      ))}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Active Filter Tags */}
      {activeFilters.length > 0 && (
        <div className="flex items-center gap-1">
          <Filter className="h-4 w-4 text-neutral-400" />
          {activeFilters.map((filter) => (
            <span
              key={filter}
              className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900 dark:text-blue-300"
            >
              {filter}
              <button
                onClick={() => clearFilter(filter)}
                className="hover:text-blue-900 dark:hover:text-blue-100"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* View Mode Dropdown */}
      <ViewModeDropdown viewPreferences={viewPreferences} onViewChange={setViewPreferences} />
    </div>
  );
}

export default DomainFilterToolbar;
