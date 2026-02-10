"use client";

import * as React from "react";
import {
  Clock,
  Sun,
  Calendar,
  CalendarDays,
  X,
  Check,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================================================
// Types
// ============================================================================

export interface SnoozeOption {
  id: string;
  label: string;
  icon: React.ReactNode;
  getDate: () => Date;
}

export interface SnoozedEmail {
  emailId: string;
  snoozeUntil: Date;
  originalFolder: string;
  subject: string;
}

interface EmailSnoozeProps {
  /** Email ID to snooze */
  emailId: string;
  /** Email subject for confirmation */
  emailSubject?: string;
  /** Callback when snooze is set */
  onSnooze: (emailId: string, snoozeUntil: Date) => void;
  /** Callback when dialog is closed */
  onClose: () => void;
  /** Whether the dialog is open */
  isOpen: boolean;
  /** Optional additional CSS classes */
  className?: string;
}

interface SnoozeQuickButtonProps {
  option: SnoozeOption;
  onClick: () => void;
}

interface CustomDatePickerProps {
  selectedDate: Date | null;
  onSelect: (date: Date) => void;
  minDate?: Date;
}

// ============================================================================
// Constants & Helpers
// ============================================================================

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function getNextWeekday(dayOfWeek: number, hour = 9): Date {
  const now = new Date();
  const result = new Date(now);
  result.setHours(hour, 0, 0, 0);

  const currentDay = now.getDay();
  let daysUntil = dayOfWeek - currentDay;

  if (daysUntil <= 0) {
    daysUntil += 7;
  }

  result.setDate(result.getDate() + daysUntil);
  return result;
}

function addHours(date: Date, hours: number): Date {
  const result = new Date(date);
  result.setTime(result.getTime() + hours * 60 * 60 * 1000);
  return result;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function setTimeToMorning(date: Date, hour = 9): Date {
  const result = new Date(date);
  result.setHours(hour, 0, 0, 0);
  return result;
}

function formatSnoozeTime(date: Date): string {
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const tomorrow = addDays(now, 1);
  const isTomorrow = date.toDateString() === tomorrow.toDateString();

  const timeStr = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  if (isToday) {
    return `Today at ${timeStr}`;
  }
  if (isTomorrow) {
    return `Tomorrow at ${timeStr}`;
  }

  const dateStr = date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  return `${dateStr} at ${timeStr}`;
}

// Default quick snooze options (similar to Gmail)
const DEFAULT_SNOOZE_OPTIONS: SnoozeOption[] = [
  {
    id: "later-today",
    label: "Later today",
    icon: <Clock className="h-5 w-5" />,
    getDate: () => {
      const now = new Date();
      // If before 2pm, snooze to 4pm. If after 2pm, snooze to 8pm
      const targetHour = now.getHours() < 14 ? 16 : 20;
      const result = new Date(now);
      result.setHours(targetHour, 0, 0, 0);
      // If target is in the past, add 4 hours from now
      if (result <= now) {
        return addHours(now, 4);
      }
      return result;
    },
  },
  {
    id: "tomorrow",
    label: "Tomorrow",
    icon: <Sun className="h-5 w-5" />,
    getDate: () => setTimeToMorning(addDays(new Date(), 1), 8),
  },
  {
    id: "this-weekend",
    label: "This weekend",
    icon: <CalendarDays className="h-5 w-5" />,
    getDate: () => getNextWeekday(6, 9), // Saturday 9am
  },
  {
    id: "next-week",
    label: "Next week",
    icon: <Calendar className="h-5 w-5" />,
    getDate: () => getNextWeekday(1, 8), // Monday 8am
  },
];

// ============================================================================
// Custom Date Picker Component
// ============================================================================

function CustomDatePicker({ selectedDate, onSelect, minDate }: CustomDatePickerProps) {
  const [viewDate, setViewDate] = React.useState(() => selectedDate ?? new Date());
  const [selectedTime, setSelectedTime] = React.useState("09:00");

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  // Get days in month
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = new Date(year, month, 1).getDay();

  // Generate calendar grid
  const calendarDays: (Date | null)[] = [];

  // Empty cells for days before the first day of the month
  for (let i = 0; i < firstDayOfMonth; i++) {
    calendarDays.push(null);
  }

  // Actual days of the month
  for (let day = 1; day <= daysInMonth; day++) {
    calendarDays.push(new Date(year, month, day));
  }

  const handlePrevMonth = () => {
    setViewDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setViewDate(new Date(year, month + 1, 1));
  };

  const handleDateClick = (date: Date) => {
    const [hoursStr, minutesStr] = selectedTime.split(":");
    const hours = Number(hoursStr) || 0;
    const minutes = Number(minutesStr) || 0;
    const finalDate = new Date(date);
    finalDate.setHours(hours, minutes, 0, 0);
    onSelect(finalDate);
  };

  const isDateDisabled = (date: Date): boolean => {
    if (!minDate) return false;
    const dateOnly = new Date(date);
    dateOnly.setHours(0, 0, 0, 0);
    const minDateOnly = new Date(minDate);
    minDateOnly.setHours(0, 0, 0, 0);
    return dateOnly < minDateOnly;
  };

  const isDateSelected = (date: Date): boolean => {
    if (!selectedDate) return false;
    return date.toDateString() === selectedDate.toDateString();
  };

  const isToday = (date: Date): boolean => {
    return date.toDateString() === new Date().toDateString();
  };

  return (
    <div className="p-4">
      {/* Month navigation */}
      <div className="mb-4 flex items-center justify-between">
        <button
          type="button"
          onClick={handlePrevMonth}
          className="rounded-full p-1 hover:bg-muted"
          aria-label="Previous month"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <span className="font-medium">
          {MONTHS[month]} {year}
        </span>
        <button
          type="button"
          onClick={handleNextMonth}
          className="rounded-full p-1 hover:bg-muted"
          aria-label="Next month"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* Weekday headers */}
      <div className="mb-2 grid grid-cols-7 gap-1">
        {WEEKDAYS.map((day) => (
          <div key={day} className="py-1 text-center text-xs font-medium text-muted-foreground">
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {calendarDays.map((date, index) => (
          <div key={index} className="aspect-square">
            {date ? (
              <button
                type="button"
                onClick={() => handleDateClick(date)}
                disabled={isDateDisabled(date)}
                className={cn(
                  "flex h-full w-full items-center justify-center rounded-full text-sm",
                  "transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  isDateDisabled(date) && "cursor-not-allowed text-muted-foreground/30",
                  !isDateDisabled(date) && "hover:bg-muted",
                  isDateSelected(date) && "bg-primary text-primary-foreground hover:bg-primary/90",
                  isToday(date) && !isDateSelected(date) && "border border-primary"
                )}
              >
                {date.getDate()}
              </button>
            ) : null}
          </div>
        ))}
      </div>

      {/* Time picker */}
      <div className="mt-4 border-t pt-4">
        <label htmlFor="snooze-time" className="mb-2 block text-sm font-medium">
          Remind at
        </label>
        <select
          id="snooze-time"
          value={selectedTime}
          onChange={(e) => setSelectedTime(e.target.value)}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="06:00">6:00 AM</option>
          <option value="07:00">7:00 AM</option>
          <option value="08:00">8:00 AM</option>
          <option value="09:00">9:00 AM</option>
          <option value="10:00">10:00 AM</option>
          <option value="11:00">11:00 AM</option>
          <option value="12:00">12:00 PM</option>
          <option value="13:00">1:00 PM</option>
          <option value="14:00">2:00 PM</option>
          <option value="15:00">3:00 PM</option>
          <option value="16:00">4:00 PM</option>
          <option value="17:00">5:00 PM</option>
          <option value="18:00">6:00 PM</option>
          <option value="19:00">7:00 PM</option>
          <option value="20:00">8:00 PM</option>
          <option value="21:00">9:00 PM</option>
        </select>
      </div>
    </div>
  );
}

// ============================================================================
// Snooze Quick Button Component
// ============================================================================

function SnoozeQuickButton({ option, onClick }: SnoozeQuickButtonProps) {
  const snoozeDate = option.getDate();

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg px-4 py-3",
        "text-left transition-colors hover:bg-muted",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      )}
    >
      <span className="text-muted-foreground">{option.icon}</span>
      <div className="flex-1">
        <div className="font-medium">{option.label}</div>
        <div className="text-sm text-muted-foreground">{formatSnoozeTime(snoozeDate)}</div>
      </div>
    </button>
  );
}

// ============================================================================
// Main Email Snooze Component
// ============================================================================

/**
 * Email Snooze Dialog component
 *
 * Features:
 * - Quick snooze options (later today, tomorrow, weekend, next week)
 * - Custom date and time picker
 * - Keyboard accessible
 * - Shows exact snooze time for each option
 *
 * @example
 * ```tsx
 * <EmailSnooze
 *   emailId="email-123"
 *   emailSubject="Meeting notes"
 *   isOpen={isSnoozeOpen}
 *   onSnooze={(id, date) => snoozeEmail(id, date)}
 *   onClose={() => setSnoozeOpen(false)}
 * />
 * ```
 */
export function EmailSnooze({
  emailId,
  emailSubject,
  onSnooze,
  onClose,
  isOpen,
  className,
}: EmailSnoozeProps) {
  const [showCustomPicker, setShowCustomPicker] = React.useState(false);
  const [customDate, setCustomDate] = React.useState<Date | null>(null);
  const dialogRef = React.useRef<HTMLDivElement>(null);

  // Reset state when dialog closes
  React.useEffect(() => {
    if (!isOpen) {
      setShowCustomPicker(false);
      setCustomDate(null);
    }
  }, [isOpen]);

  // Close on escape
  React.useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  // Close on click outside
  React.useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, onClose]);

  // Focus trap
  React.useEffect(() => {
    if (!isOpen || !dialogRef.current) return;

    const focusableElements = dialogRef.current.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );

    const firstElement = focusableElements[0];
    if (focusableElements.length > 0 && firstElement) {
      firstElement.focus();
    }
  }, [isOpen, showCustomPicker]);

  const handleQuickSnooze = (option: SnoozeOption) => {
    onSnooze(emailId, option.getDate());
    onClose();
  };

  const handleCustomDateSelect = (date: Date) => {
    setCustomDate(date);
  };

  const handleCustomSnooze = () => {
    if (customDate) {
      onSnooze(emailId, customDate);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50 bg-black/50" aria-hidden="true" />

      {/* Dialog */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="snooze-dialog-title"
        className={cn(
          "fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2",
          "rounded-xl border bg-background shadow-xl",
          className
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 id="snooze-dialog-title" className="text-lg font-semibold">
            {showCustomPicker ? "Pick date & time" : "Snooze until..."}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-muted"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Subject preview */}
        {emailSubject && !showCustomPicker && (
          <div className="border-b bg-muted/30 px-4 py-2">
            <p className="truncate text-sm text-muted-foreground">{emailSubject}</p>
          </div>
        )}

        {/* Content */}
        {showCustomPicker ? (
          <>
            <CustomDatePicker
              selectedDate={customDate}
              onSelect={handleCustomDateSelect}
              minDate={new Date()}
            />

            {/* Custom picker actions */}
            <div className="flex items-center justify-between border-t px-4 py-3">
              <button
                type="button"
                onClick={() => setShowCustomPicker(false)}
                className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted"
              >
                <ChevronLeft className="h-4 w-4" />
                Back
              </button>
              <button
                type="button"
                onClick={handleCustomSnooze}
                disabled={!customDate}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                <Check className="h-4 w-4" />
                Snooze
              </button>
            </div>

            {/* Selected time preview */}
            {customDate && (
              <div className="px-4 pb-3 text-center text-sm text-muted-foreground">
                Will reappear {formatSnoozeTime(customDate)}
              </div>
            )}
          </>
        ) : (
          <div className="py-2">
            {/* Quick options */}
            {DEFAULT_SNOOZE_OPTIONS.map((option) => (
              <SnoozeQuickButton
                key={option.id}
                option={option}
                onClick={() => handleQuickSnooze(option)}
              />
            ))}

            {/* Custom date picker trigger */}
            <button
              type="button"
              onClick={() => setShowCustomPicker(true)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-4 py-3",
                "text-left transition-colors hover:bg-muted",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              )}
            >
              <span className="text-muted-foreground">
                <CalendarDays className="h-5 w-5" />
              </span>
              <div className="flex-1">
                <div className="font-medium">Pick date & time</div>
                <div className="text-sm text-muted-foreground">Choose a custom time</div>
              </div>
            </button>
          </div>
        )}
      </div>
    </>
  );
}

// ============================================================================
// Hook for managing snoozed emails
// ============================================================================

interface UseEmailSnoozeOptions {
  onSnoozeComplete?: (email: SnoozedEmail) => void;
  onUnsnooze?: (emailId: string) => void;
}

/**
 * Hook for managing email snooze functionality
 */
export function useEmailSnooze(options: UseEmailSnoozeOptions = {}) {
  const [snoozedEmails, setSnoozedEmails] = React.useState<Map<string, SnoozedEmail>>(new Map());
  const [activeSnoozeDialog, setActiveSnoozeDialog] = React.useState<{
    emailId: string;
    subject?: string;
  } | null>(null);

  // Check for due snoozes
  React.useEffect(() => {
    const checkInterval = setInterval(() => {
      const now = new Date();

      snoozedEmails.forEach((snoozed, emailId) => {
        if (snoozed.snoozeUntil <= now) {
          // Snooze time reached
          options.onUnsnooze?.(emailId);
          setSnoozedEmails((prev) => {
            const next = new Map(prev);
            next.delete(emailId);
            return next;
          });
        }
      });
    }, 60000); // Check every minute

    return () => clearInterval(checkInterval);
  }, [snoozedEmails, options]);

  const snoozeEmail = React.useCallback(
    (emailId: string, snoozeUntil: Date, originalFolder = "inbox", subject = "") => {
      const snoozedEmail: SnoozedEmail = {
        emailId,
        snoozeUntil,
        originalFolder,
        subject,
      };

      setSnoozedEmails((prev) => {
        const next = new Map(prev);
        next.set(emailId, snoozedEmail);
        return next;
      });

      options.onSnoozeComplete?.(snoozedEmail);
    },
    [options]
  );

  const unsnoozeEmail = React.useCallback(
    (emailId: string) => {
      setSnoozedEmails((prev) => {
        const next = new Map(prev);
        next.delete(emailId);
        return next;
      });

      options.onUnsnooze?.(emailId);
    },
    [options]
  );

  const openSnoozeDialog = React.useCallback((emailId: string, subject?: string) => {
    setActiveSnoozeDialog({ emailId, subject });
  }, []);

  const closeSnoozeDialog = React.useCallback(() => {
    setActiveSnoozeDialog(null);
  }, []);

  const isEmailSnoozed = React.useCallback(
    (emailId: string) => snoozedEmails.has(emailId),
    [snoozedEmails]
  );

  const getSnoozeInfo = React.useCallback(
    (emailId: string) => snoozedEmails.get(emailId),
    [snoozedEmails]
  );

  return {
    snoozedEmails: Array.from(snoozedEmails.values()),
    activeSnoozeDialog,
    snoozeEmail,
    unsnoozeEmail,
    openSnoozeDialog,
    closeSnoozeDialog,
    isEmailSnoozed,
    getSnoozeInfo,
  };
}

export default EmailSnooze;
