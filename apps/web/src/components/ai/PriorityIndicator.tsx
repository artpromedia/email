"use client";

/**
 * Priority Indicator Component
 * Visual priority badges for emails
 */

import { cn } from "@email/ui";

// ============================================================
// TYPES
// ============================================================

type PriorityLevel = "high" | "medium" | "normal" | "low";

interface PriorityIndicatorProps {
  level: PriorityLevel;
  score?: number;
  showLabel?: boolean;
  showScore?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

interface PriorityBadgeProps {
  level: PriorityLevel;
  label?: string;
  className?: string;
}

// ============================================================
// CONFIG
// ============================================================

const priorityConfig = {
  high: {
    indicator: "🔴",
    label: "High Priority",
    color: "text-red-600 dark:text-red-400",
    bgColor: "bg-red-100 dark:bg-red-900/30",
    borderColor: "border-red-200 dark:border-red-800",
    dotColor: "bg-red-500",
  },
  medium: {
    indicator: "🟡",
    label: "Medium Priority",
    color: "text-yellow-600 dark:text-yellow-400",
    bgColor: "bg-yellow-100 dark:bg-yellow-900/30",
    borderColor: "border-yellow-200 dark:border-yellow-800",
    dotColor: "bg-yellow-500",
  },
  normal: {
    indicator: "⚪",
    label: "Normal",
    color: "text-neutral-600 dark:text-neutral-400",
    bgColor: "bg-neutral-100 dark:bg-neutral-800",
    borderColor: "border-neutral-200 dark:border-neutral-700",
    dotColor: "bg-neutral-400",
  },
  low: {
    indicator: "⚫",
    label: "Low Priority",
    color: "text-neutral-500 dark:text-neutral-500",
    bgColor: "bg-neutral-50 dark:bg-neutral-900",
    borderColor: "border-neutral-100 dark:border-neutral-800",
    dotColor: "bg-neutral-300 dark:bg-neutral-600",
  },
};

const sizeConfig = {
  sm: {
    text: "text-xs",
    indicator: "text-sm",
    padding: "px-1.5 py-0.5",
    dot: "h-1.5 w-1.5",
  },
  md: {
    text: "text-sm",
    indicator: "text-base",
    padding: "px-2 py-1",
    dot: "h-2 w-2",
  },
  lg: {
    text: "text-base",
    indicator: "text-lg",
    padding: "px-3 py-1.5",
    dot: "h-2.5 w-2.5",
  },
};

// ============================================================
// COMPONENTS
// ============================================================

/**
 * Simple emoji indicator
 */
export function PriorityIndicator({
  level,
  score,
  showLabel = false,
  showScore = false,
  size = "md",
  className,
}: Readonly<PriorityIndicatorProps>) {
  const config = priorityConfig[level];
  const sizes = sizeConfig[size];

  return (
    <span
      className={cn("inline-flex items-center gap-1", className)}
      title={`${config.label}${score !== undefined ? ` (${Math.round(score * 100)}%)` : ""}`}
    >
      <span className={sizes.indicator}>{config.indicator}</span>
      {showLabel && (
        <span className={cn(sizes.text, config.color, "font-medium")}>{config.label}</span>
      )}
      {showScore && score !== undefined && (
        <span className={cn(sizes.text, "text-neutral-500")}>({Math.round(score * 100)}%)</span>
      )}
    </span>
  );
}

/**
 * Badge-style priority indicator
 */
export function PriorityBadge({ level, label, className }: Readonly<PriorityBadgeProps>) {
  const config = priorityConfig[level];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium",
        config.bgColor,
        config.borderColor,
        config.color,
        className
      )}
    >
      <span>{config.indicator}</span>
      <span>{label || config.label}</span>
    </span>
  );
}

/**
 * Dot-style priority indicator (minimal)
 */
export function PriorityDot({
  level,
  size = "md",
  className,
}: Readonly<{
  level: PriorityLevel;
  size?: "sm" | "md" | "lg";
  className?: string;
}>) {
  const config = priorityConfig[level];
  const sizes = sizeConfig[size];

  return (
    <span
      className={cn("inline-block rounded-full", config.dotColor, sizes.dot, className)}
      title={config.label}
    />
  );
}

/**
 * Priority indicator with factors tooltip
 */
export function PriorityIndicatorWithFactors({
  level,
  factors,
  className,
}: Readonly<{
  level: PriorityLevel;
  factors?: { factor: string; description: string }[];
  className?: string;
}>) {
  const config = priorityConfig[level];

  return (
    <div className={cn("group relative inline-flex", className)}>
      <PriorityIndicator level={level} />

      {factors && factors.length > 0 && (
        <div className="invisible absolute bottom-full left-0 z-50 mb-2 w-64 rounded-lg border bg-white p-3 opacity-0 shadow-lg transition-all group-hover:visible group-hover:opacity-100 dark:border-neutral-700 dark:bg-neutral-800">
          <div className="mb-2 flex items-center gap-2">
            <span>{config.indicator}</span>
            <span className={cn("font-medium", config.color)}>{config.label}</span>
          </div>
          <div className="space-y-1.5">
            {factors.map((factor, i) => (
              <div key={`factor-${factor.factor}-${i}`} className="text-xs">
                <span className="font-medium text-neutral-700 dark:text-neutral-300">
                  {factor.factor}:
                </span>{" "}
                <span className="text-neutral-500 dark:text-neutral-400">{factor.description}</span>
              </div>
            ))}
          </div>
          {/* Arrow */}
          <div className="absolute -bottom-1.5 left-4 h-3 w-3 rotate-45 border-b border-r bg-white dark:border-neutral-700 dark:bg-neutral-800" />
        </div>
      )}
    </div>
  );
}

/**
 * Priority column header for email list
 */
export function PriorityColumnHeader({ className }: Readonly<{ className?: string }>) {
  return (
    <div className={cn("flex items-center gap-1 text-xs text-neutral-500", className)}>
      <span>Priority</span>
      <span className="text-[10px]">(AI)</span>
    </div>
  );
}

/**
 * Hook to get priority level from score
 */
export function scoreToLevel(score: number): PriorityLevel {
  if (score >= 0.7) return "high";
  if (score >= 0.4) return "medium";
  if (score >= 0.2) return "normal";
  return "low";
}

/**
 * Helper to format priority for display
 */
export function formatPriority(level: PriorityLevel): string {
  return priorityConfig[level].label;
}

export { type PriorityLevel };
