"use client";

/**
 * Calendar Page
 * Email-integrated calendar view
 */

import { useState } from "react";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Button } from "@email/ui";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
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

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

export default function CalendarPage() {
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());

  const daysInMonth = getDaysInMonth(currentYear, currentMonth);
  const firstDay = getFirstDayOfMonth(currentYear, currentMonth);

  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(currentYear - 1);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  };

  const isToday = (day: number) =>
    day === today.getDate() &&
    currentMonth === today.getMonth() &&
    currentYear === today.getFullYear();

  return (
    <div className="flex h-full flex-col bg-white dark:bg-neutral-950">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-neutral-200 px-6 py-4 dark:border-neutral-700">
        <div className="flex items-center gap-3">
          <CalendarIcon className="h-6 w-6 text-blue-600" />
          <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">Calendar</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setCurrentMonth(today.getMonth());
              setCurrentYear(today.getFullYear());
            }}
          >
            Today
          </Button>
          <Button size="sm">
            <Plus className="mr-2 h-4 w-4" />
            New Event
          </Button>
        </div>
      </div>

      {/* Calendar Navigation */}
      <div className="flex items-center justify-between border-b border-neutral-200 px-6 py-3 dark:border-neutral-700">
        <button
          onClick={handlePrevMonth}
          className="rounded-md p-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800"
        >
          <ChevronLeft className="h-5 w-5 text-neutral-600 dark:text-neutral-400" />
        </button>
        <h2 className="text-lg font-medium text-neutral-900 dark:text-neutral-100">
          {MONTHS[currentMonth]} {currentYear}
        </h2>
        <button
          onClick={handleNextMonth}
          className="rounded-md p-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800"
        >
          <ChevronRight className="h-5 w-5 text-neutral-600 dark:text-neutral-400" />
        </button>
      </div>

      {/* Calendar Grid */}
      <div className="flex-1 overflow-auto p-4">
        {/* Day Headers */}
        <div className="grid grid-cols-7 border-b border-neutral-200 pb-2 dark:border-neutral-700">
          {DAYS.map((day) => (
            <div
              key={day}
              className="text-center text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400"
            >
              {day}
            </div>
          ))}
        </div>

        {/* Day Cells */}
        <div className="grid grid-cols-7">
          {/* Empty cells for days before the first */}
          {Array.from({ length: firstDay }).map((_, i) => (
            <div
              key={`empty-${String(i)}`}
              className="min-h-[100px] border-b border-r border-neutral-100 p-2 dark:border-neutral-800"
            />
          ))}

          {/* Day cells */}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            return (
              <div
                key={day}
                className="min-h-[100px] border-b border-r border-neutral-100 p-2 transition-colors hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900"
              >
                <span
                  className={
                    isToday(day)
                      ? "inline-flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-sm font-medium text-white"
                      : "inline-flex h-7 w-7 items-center justify-center text-sm text-neutral-700 dark:text-neutral-300"
                  }
                >
                  {day}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
