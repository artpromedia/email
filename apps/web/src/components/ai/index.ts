/**
 * AI Components - Barrel Export
 * User-facing AI features for Sprint 2
 */

// Smart Reply
export {
  SmartReplySuggestions,
  QuickReplySuggestions,
  type ReplySuggestion,
} from "./SmartReplySuggestions";

// Priority Detection
export {
  PriorityIndicator,
  PriorityBadge,
  PriorityDot,
  PriorityIndicatorWithFactors,
  scoreToLevel,
  type PriorityLevel,
} from "./PriorityIndicator";

// Email Summarization
export { EmailSummary, ThreadSummary, ActionItemsList, TldrBadge } from "./EmailSummary";

// Draft Assistant
export {
  useInlineSuggestion,
  GhostText,
  HelpMeWriteButton,
  ToneAdjustmentMenu,
  GrammarCheckButton,
} from "./DraftAssistant";

// Auto-Reply Settings
export {
  AutoReplyModeToggle,
  AutoReplyRuleList,
  AutoReplyRuleEditor,
  AutoReplyAuditLog,
  AutoReplySettings,
} from "./AutoReplySettings";
