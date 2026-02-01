"use client";

/**
 * Form Error Announcement
 * Ensures form errors are announced to screen readers
 * WCAG 2.1 Criterion 3.3.1: Error Identification
 */

import React, { useEffect, useRef } from "react";
import { cn } from "@email/ui";

export interface FormErrorProps {
  /** Error message to display */
  message: string;
  /** Field ID this error is associated with */
  fieldId?: string;
  /** Whether to announce immediately */
  announce?: boolean;
  /** Optional className for styling */
  className?: string;
}

/**
 * Accessible form error message component
 */
export function FormError({
  message,
  fieldId,
  announce = true,
  className,
}: Readonly<FormErrorProps>) {
  const errorId = fieldId ? `${fieldId}-error` : undefined;

  return (
    <p
      id={errorId}
      role={announce ? "alert" : undefined}
      aria-live={announce ? "assertive" : undefined}
      className={cn("text-sm text-red-600 dark:text-red-400", "mt-1", className)}
    >
      {message}
    </p>
  );
}

/**
 * Hook to announce errors to screen readers
 */
export function useFormErrorAnnouncement(
  errors: Record<string, string | undefined>,
  dependencies: unknown[] = []
) {
  const previousErrors = useRef<Record<string, string | undefined>>({});
  const announcementRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const newErrors = Object.entries(errors).filter(
      ([key, value]) => value && value !== previousErrors.current[key]
    );

    if (newErrors.length > 0 && announcementRef.current) {
      const message =
        newErrors.length === 1
          ? `Error: ${newErrors[0]?.[1] ?? "Unknown error"}`
          : `${newErrors.length} errors found: ${newErrors.map(([, msg]) => msg).join(", ")}`;

      // Update announcement element
      announcementRef.current.textContent = message;
    }

    previousErrors.current = errors;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [errors, ...dependencies]);

  return (
    <div
      ref={announcementRef}
      className="sr-only"
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
    />
  );
}

/**
 * Accessible form field wrapper with error support
 */
export interface FormFieldProps {
  /** Field label */
  label: string;
  /** Field ID */
  fieldId: string;
  /** Error message (if any) */
  error?: string;
  /** Whether the field is required */
  required?: boolean;
  /** Hint text for the field */
  hint?: string;
  /** Field input element */
  children: React.ReactNode;
  /** Optional className for container */
  className?: string;
}

export function FormField({
  label,
  fieldId,
  error,
  required,
  hint,
  children,
  className,
}: Readonly<FormFieldProps>) {
  const hintId = hint ? `${fieldId}-hint` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ");

  return (
    <div className={cn("space-y-1", className)}>
      <label
        htmlFor={fieldId}
        className="block text-sm font-medium text-neutral-700 dark:text-neutral-300"
      >
        {label}
        {required && (
          <span className="text-red-600 dark:text-red-400" aria-label="required">
            {" "}
            *
          </span>
        )}
      </label>

      {hint && (
        <p id={hintId} className="text-sm text-neutral-500 dark:text-neutral-400">
          {hint}
        </p>
      )}

      {/* Clone children and add accessibility props */}
      {React.isValidElement(children) &&
      (children.type === "input" || children.type === "textarea" || children.type === "select")
        ? React.cloneElement(children, {
            id: fieldId,
            "aria-describedby": describedBy || undefined,
            "aria-invalid": error ? true : undefined,
            "aria-required": required ? true : undefined,
          } as React.HTMLAttributes<HTMLElement>)
        : children}

      {error && <FormError message={error} fieldId={fieldId} />}
    </div>
  );
}

/**
 * Example usage:
 *
 * function LoginForm() {
 *   const [errors, setErrors] = useState({});
 *   const errorAnnouncement = useFormErrorAnnouncement(errors);
 *
 *   return (
 *     <form>
 *       {errorAnnouncement}
 *
 *       <FormField
 *         label="Email"
 *         fieldId="email"
 *         error={errors.email}
 *         required
 *       >
 *         <input type="email" />
 *       </FormField>
 *     </form>
 *   );
 * }
 */
