/**
 * Enterprise Email Database - PostgreSQL Enums
 * All enum types used across the schema
 */

import { pgEnum } from "drizzle-orm/pg-core";

// ============================================================
// ORGANIZATION ENUMS
// ============================================================

/** Subscription tiers for organizations */
export const subscriptionTierEnum = pgEnum("subscription_tier", ["free", "pro", "enterprise"]);

// ============================================================
// DOMAIN ENUMS
// ============================================================

/** Domain verification methods */
export const verificationMethodEnum = pgEnum("verification_method", [
  "dns_txt",
  "dns_cname",
  "meta_tag",
]);

/** Domain status */
export const domainStatusEnum = pgEnum("domain_status", [
  "pending",
  "active",
  "suspended",
  "deleted",
]);

/** Catch-all email action */
export const catchAllActionEnum = pgEnum("catch_all_action", ["deliver", "reject", "bounce"]);

/** DNS record types */
export const dnsRecordTypeEnum = pgEnum("dns_record_type", ["mx", "txt", "cname", "dkim", "bimi", "mta_sts", "tls_rpt"]);

/** DKIM key algorithms */
export const dkimAlgorithmEnum = pgEnum("dkim_algorithm", ["rsa2048", "rsa4096", "ed25519"]);

// ============================================================
// USER ENUMS
// ============================================================

/** User account status */
export const userStatusEnum = pgEnum("user_status", [
  "active",
  "suspended",
  "deleted",
  "pending_verification",
]);

/** User role within organization */
export const userRoleEnum = pgEnum("user_role", ["owner", "admin", "member", "guest"]);

// ============================================================
// FOLDER ENUMS
// ============================================================

/** Folder type */
export const folderTypeEnum = pgEnum("folder_type", ["system", "custom"]);

/** System folder types */
export const systemFolderTypeEnum = pgEnum("system_folder_type", [
  "inbox",
  "sent",
  "drafts",
  "trash",
  "spam",
  "archive",
  "starred",
]);

// ============================================================
// SHARED MAILBOX ENUMS
// ============================================================

/** Shared mailbox member permissions */
export const sharedMailboxPermissionEnum = pgEnum("shared_mailbox_permission", [
  "read",
  "read_write",
  "full",
  "admin",
]);

// ============================================================
// DISTRIBUTION LIST ENUMS
// ============================================================

/** Distribution list member types */
export const distributionListMemberTypeEnum = pgEnum("distribution_list_member_type", [
  "user",
  "external_email",
  "nested_list",
]);

// ============================================================
// ROUTING ENUMS
// ============================================================

/** Email routing rule actions */
export const routingActionEnum = pgEnum("routing_action", [
  "continue", // Continue processing, no special action
  "deliver", // Deliver to specified mailbox
  "deliver_to_folder", // Deliver to specific folder
  "forward", // Forward to external address
  "add_bcc", // Add BCC recipients
  "redirect", // Redirect (change envelope)
  "reject", // Reject with message
  "quarantine", // Send to quarantine
  "delay", // Delay delivery
  "add_header", // Add email headers
  "remove_header", // Remove email headers
  "modify_subject", // Modify subject line
  "add_label", // Add label to email
  "add_disclaimer", // Add disclaimer/footer
  "notify", // Send notification webhook
]);

// ============================================================
// EMAIL ENUMS
// ============================================================

/** Email priority levels */
export const emailPriorityEnum = pgEnum("email_priority", ["low", "normal", "high", "urgent"]);

/** Email direction */
export const emailDirectionEnum = pgEnum("email_direction", ["inbound", "outbound", "internal"]);

/** Email delivery status */
export const emailDeliveryStatusEnum = pgEnum("email_delivery_status", [
  "pending",
  "sent",
  "delivered",
  "bounced",
  "failed",
  "deferred",
]);
