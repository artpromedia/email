import { Message } from "@prisma/client";
import { Condition } from "./types";
import { z } from "zod";

// Type imports
type ConditionType = z.infer<typeof import("./types").ConditionType>;
type ConditionOperator = z.infer<typeof import("./types").ConditionOperator>;

/**
 * Normalizes text for comparison - converts to lowercase and removes diacritics
 */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, ""); // Remove diacritics
}

/**
 * Evaluates a single condition against a message
 */
export function evaluateCondition(
  condition: Condition,
  message: Message,
): boolean {
  const { type, operator, value, caseSensitive } = condition;

  // Get the field value from the message
  const fieldValue = getFieldValue(type, message);

  if (fieldValue === null || fieldValue === undefined) {
    return operator === "is_empty";
  }

  // Apply case sensitivity and normalization
  const normalizedFieldValue = Array.isArray(fieldValue)
    ? fieldValue.map((v) => (caseSensitive ? v : normalizeText(String(v))))
    : caseSensitive
      ? String(fieldValue)
      : normalizeText(String(fieldValue));

  const normalizedConditionValue =
    value !== undefined
      ? Array.isArray(value)
        ? value.map((v) =>
            caseSensitive ? String(v) : normalizeText(String(v)),
          )
        : caseSensitive
          ? String(value)
          : normalizeText(String(value))
      : undefined;

  return evaluateOperator(
    operator,
    normalizedFieldValue,
    normalizedConditionValue,
  );
}

/**
 * Extracts field value from message based on condition type
 */
function getFieldValue(type: ConditionType, message: Message): any {
  switch (type) {
    case "from":
      return message.from;
    case "to":
      return message.to;
    case "cc":
      return message.cc;
    case "subject":
      return message.subject;
    case "body":
      return message.body;
    case "has_attachment":
      // This would need to be resolved with attachment count
      return false; // Placeholder - needs database query
    case "attachment_name":
      // This would need attachment filenames
      return []; // Placeholder - needs database query
    case "sender_domain":
      const emailMatch = message.from.match(/@([^>]+)/);
      return emailMatch ? emailMatch[1] : "";
    case "size_greater_than":
    case "size_less_than":
      return message.body.length; // Simplified - should include attachments
    case "date_after":
    case "date_before":
      return message.receivedAt || message.createdAt;
    case "priority":
      return message.priority;
    case "has_label":
      // This would need to be resolved with labels
      return []; // Placeholder - needs database query
    case "folder":
      return message.folder;
    default:
      return null;
  }
}

/**
 * Evaluates an operator against field and condition values
 */
function evaluateOperator(
  operator: ConditionOperator,
  fieldValue: any,
  conditionValue: any,
): boolean {
  switch (operator) {
    case "equals":
      return fieldValue === conditionValue;

    case "not_equals":
      return fieldValue !== conditionValue;

    case "contains":
      if (Array.isArray(fieldValue)) {
        return fieldValue.some((v) =>
          String(v).includes(String(conditionValue)),
        );
      }
      return String(fieldValue).includes(String(conditionValue));

    case "not_contains":
      if (Array.isArray(fieldValue)) {
        return !fieldValue.some((v) =>
          String(v).includes(String(conditionValue)),
        );
      }
      return !String(fieldValue).includes(String(conditionValue));

    case "starts_with":
      if (Array.isArray(fieldValue)) {
        return fieldValue.some((v) =>
          String(v).startsWith(String(conditionValue)),
        );
      }
      return String(fieldValue).startsWith(String(conditionValue));

    case "ends_with":
      if (Array.isArray(fieldValue)) {
        return fieldValue.some((v) =>
          String(v).endsWith(String(conditionValue)),
        );
      }
      return String(fieldValue).endsWith(String(conditionValue));

    case "matches_regex":
      try {
        const regex = new RegExp(String(conditionValue));
        if (Array.isArray(fieldValue)) {
          return fieldValue.some((v) => regex.test(String(v)));
        }
        return regex.test(String(fieldValue));
      } catch {
        return false; // Invalid regex
      }

    case "is_empty":
      if (Array.isArray(fieldValue)) {
        return fieldValue.length === 0;
      }
      return !fieldValue || String(fieldValue).trim() === "";

    case "is_not_empty":
      if (Array.isArray(fieldValue)) {
        return fieldValue.length > 0;
      }
      return fieldValue && String(fieldValue).trim() !== "";

    case "greater_than":
      return Number(fieldValue) > Number(conditionValue);

    case "less_than":
      return Number(fieldValue) < Number(conditionValue);

    case "in_list":
      if (!Array.isArray(conditionValue)) return false;
      if (Array.isArray(fieldValue)) {
        return fieldValue.some((v) => conditionValue.includes(String(v)));
      }
      return conditionValue.includes(String(fieldValue));

    case "not_in_list":
      if (!Array.isArray(conditionValue)) return true;
      if (Array.isArray(fieldValue)) {
        return !fieldValue.some((v) => conditionValue.includes(String(v)));
      }
      return !conditionValue.includes(String(fieldValue));

    default:
      return false;
  }
}

/**
 * Evaluates all conditions for a rule (AND logic)
 */
export function evaluateConditions(
  conditions: Condition[],
  message: Message,
): boolean {
  return conditions.every((condition) => evaluateCondition(condition, message));
}
