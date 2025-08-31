/**
 * Test Data Attributes Helper
 * This file documents all required data-testid attributes for E2E tests
 * Add these attributes to the corresponding components
 */

export const TEST_IDS = {
  // Authentication
  LOGIN_FORM: "login-form",
  EMAIL_INPUT: "email-input",
  PASSWORD_INPUT: "password-input",
  LOGIN_BUTTON: "login-button",

  // Main Layout
  MAIL_SHELL: "mail-shell",
  MAIL_LIST: "mail-list",
  MAIL_ITEM: "email-item",

  // Navigation
  FOLDER_INBOX: "folder-inbox",
  FOLDER_DRAFTS: "folder-drafts",
  FOLDER_SENT: "folder-sent",
  FOLDER_SCHEDULED: "folder-scheduled",
  FOLDER_OUTBOX: "folder-outbox",
  FOLDER_ARCHIVE: "folder-archive",
  FOLDER_SPAM: "folder-spam",
  FOLDER_TRASH: "folder-trash",
  FOLDER_QUARANTINE: "folder-quarantine",

  // Headers
  FOLDER_HEADER: "folder-header",
  CATEGORY_HEADER: "category-header",
  LABEL_HEADER: "label-header",
  QUARANTINE_HEADER: "quarantine-header",

  // Unread Counts
  UNREAD_COUNT: "unread-count",
  UNREAD_INDICATOR: "unread-indicator",

  // Compose
  COMPOSE_BTN: "compose-btn",
  COMPOSE_VIEW: "compose-view",
  COMPOSE_TO: "compose-to",
  COMPOSE_SUBJECT: "compose-subject",
  COMPOSE_BODY: "compose-body",
  SEND_BTN: "send-btn",
  SAVE_DRAFT_BTN: "save-draft-btn",
  SCHEDULE_BTN: "schedule-btn",
  CLOSE_COMPOSER_BTN: "close-composer-btn",

  // Draft Management
  DRAFT_EDITOR: "draft-editor",
  AUTOSAVE_INDICATOR: "autosave-indicator",

  // Scheduling
  SCHEDULE_DIALOG: "schedule-dialog",
  SCHEDULE_DATE: "schedule-date",
  SCHEDULE_TIME: "schedule-time",
  CONFIRM_SCHEDULE_BTN: "confirm-schedule-btn",
  UPDATE_SCHEDULE_BTN: "update-schedule-btn",
  CANCEL_SCHEDULE_BTN: "cancel-schedule-btn",
  EDIT_SCHEDULE_BTN: "edit-schedule-btn",
  SEND_NOW_BTN: "send-now-btn",
  SCHEDULE_TIME_DISPLAY: "schedule-time-display",

  // Message Actions
  MESSAGE_VIEW: "message-view",
  MESSAGE_SUBJECT: "message-subject",
  MESSAGE_BODY: "message-body",
  MESSAGE_TO: "message-to",
  RESEND_BTN: "resend-btn",
  RESEND_INDICATOR: "resend-indicator",
  ARCHIVE_BTN: "archive-btn",
  DELETE_BTN: "delete-btn",
  MARK_READ_BTN: "mark-read-btn",
  RESTORE_BTN: "restore-btn",

  // Bulk Actions
  SELECT_ALL_CHECKBOX: "select-all-checkbox",
  BULK_ACTIONS: "bulk-actions",
  BULK_MARK_READ_BTN: "bulk-mark-read-btn",

  // Outbox Actions
  RETRY_SEND_BTN: "retry-send-btn",
  CANCEL_SEND_BTN: "cancel-send-btn",
  RETRY_DIALOG: "retry-dialog",
  CONFIRM_RETRY_BTN: "confirm-retry-btn",
  CANCEL_SEND_DIALOG: "cancel-send-dialog",
  CONFIRM_CANCEL_SEND_BTN: "confirm-cancel-send-btn",

  // Dialogs
  DELETE_DIALOG: "delete-dialog",
  CONFIRM_DELETE_BTN: "confirm-delete-btn",
  CANCEL_DIALOG: "cancel-dialog",
  CONFIRM_CANCEL_BTN: "confirm-cancel-btn",
  SEND_NOW_DIALOG: "send-now-dialog",
  CONFIRM_SEND_NOW_BTN: "confirm-send-now-btn",

  // Help System
  HELP_LINK: "help-link",
  HELP_CENTER: "help-center",
  HELP_SEARCH: "help-search",
  SEARCH_RESULTS: "search-results",
  ARTICLE_CARD: "article-card",
  ARTICLE_CONTENT: "article-content",
  ARTICLE_TITLE: "article-title",
  CATEGORY_ARTICLES: "category-articles",
  VIEW_ALL_BTN: "view-all-btn",
  HELPFUL_YES_BTN: "helpful-yes-btn",
  HELPFUL_NO_BTN: "helpful-no-btn",
  CONTACT_SUPPORT_BTN: "contact-support-btn",
  BACK_BTN: "back-btn",
  RELEASE_NOTES_BTN: "release-notes-btn",
  RELEASE_NOTES_PANEL: "release-notes-panel",
  CHANGELOG_CONTENT: "changelog-content",

  // Help Categories
  CATEGORY_GETTING_STARTED: "category-getting-started",
  CATEGORY_SECURITY: "category-security",
  CATEGORY_DELIVERABILITY: "category-deliverability",
  CATEGORY_CALENDAR: "category-calendar",
  CATEGORY_CHAT: "category-chat",

  // Settings
  SETTINGS_LINK: "settings-link",
  SETTINGS_PAGE: "settings-page",
  TAB_CONTENT: "tab-content",
  SAVE_SETTINGS_BTN: "save-settings-btn",

  // Settings Tabs
  TAB_PROFILE: "tab-profile",
  TAB_ACCOUNT: "tab-account",
  TAB_APPEARANCE: "tab-appearance",
  TAB_EMAIL: "tab-email",
  TAB_NOTIFICATIONS: "tab-notifications",
  TAB_PRIVACY: "tab-privacy",
  TAB_SECURITY: "tab-security",
  TAB_RULES: "tab-rules",
  TAB_ADVANCED: "tab-advanced",

  // Settings Fields
  DISPLAY_NAME: "display-name",
  JOB_TITLE: "job-title",
  TIMEZONE: "timezone",
  LANGUAGE: "language",
  THEME: "theme",
  FONT_SIZE: "font-size",
  SIGNATURE: "signature",
  AUTO_REPLY: "auto-reply",
  EMAIL_NOTIFICATIONS: "email-notifications",
  PUSH_NOTIFICATIONS: "push-notifications",
  READ_RECEIPTS: "read-receipts",
  TRACKING_PROTECTION: "tracking-protection",
  TWO_FACTOR_AUTH: "two-factor-auth",
  SESSION_TIMEOUT: "session-timeout",
  IMAP_ENABLED: "imap-enabled",
  DEBUG_MODE: "debug-mode",

  // Rules Management
  CREATE_RULE_BTN: "create-rule-btn",
  RULE_EDITOR: "rule-editor",
  RULE_NAME: "rule-name",
  CONDITION_FIELD: "condition-field",
  CONDITION_VALUE: "condition-value",
  ACTION_TYPE: "action-type",
  ACTION_FOLDER: "action-folder",
  SAVE_RULE_BTN: "save-rule-btn",
  RULE_LIST: "rule-list",
  RULE_ITEM: "rule-item",
  RULE_TOGGLE: "rule-toggle",
  RULE_DISABLED: "rule-disabled",

  // Toast Messages
  DRAFT_SAVED_TOAST: "draft-saved-toast",
  SENT_TOAST: "sent-toast",
  SCHEDULED_TOAST: "scheduled-toast",
  CANCELLED_TOAST: "cancelled-toast",
  MARKED_READ_TOAST: "marked-read-toast",
  ARCHIVED_TOAST: "archived-toast",
  DELETED_TOAST: "deleted-toast",
  RESTORED_TOAST: "restored-toast",
  BULK_MARKED_READ_TOAST: "bulk-marked-read-toast",
  SEND_FAILED_TOAST: "send-failed-toast",
  RETRY_SENT_TOAST: "retry-sent-toast",
  CANCELLED_SEND_TOAST: "cancelled-send-toast",
  SCHEDULE_UPDATED_TOAST: "schedule-updated-toast",
  SENT_NOW_TOAST: "sent-now-toast",
  SAVE_SUCCESS_TOAST: "save-success-toast",
  FEEDBACK_TOAST: "feedback-toast",
  SUPPORT_TOAST: "support-toast",

  // Search
  SEARCH_INPUT: "search-input",

  // Quarantine
  QUARANTINE_LIST: "quarantine-list",
  RELEASE_ALL_BTN: "release-all-btn",
  DELETE_ALL_BTN: "delete-all-btn",
  WHITELIST_SENDER_BTN: "whitelist-sender-btn",

  // Custom Categories & Labels
  CATEGORY_WORK: "category-work",
  CATEGORY_PERSONAL: "category-personal",
  CATEGORY_FINANCE: "category-finance",
  LABEL_IMPORTANT: "label-important",
  LABEL_ACTION: "label-action",
  LABEL_FOLLOWUP: "label-followup",

  // Email Properties
  SUBJECT: "subject",
} as const;

export type TestId = (typeof TEST_IDS)[keyof typeof TEST_IDS];
