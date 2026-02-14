/**
 * OonruMail Database - Relations
 * Drizzle ORM relations for type-safe joins
 */

import { relations } from "drizzle-orm";

// Core tables
import { auditLogs, loginAttempts, securityEvents, apiAccessLogs } from "./audit";
import {
  distributionLists,
  distributionListMembers,
  distributionListArchive,
} from "./distribution-lists";
import { domains, domainDnsRecords, domainDkimKeys, domainSettings } from "./domains";
import { threads, emails, emailAttachments, labels } from "./emails";
import { mailboxes, folders, folderRules } from "./mailboxes";
import { organizations } from "./organizations";
import { domainRoutingRules, transportRules, routingLogs } from "./routing";
import { sharedMailboxes, sharedMailboxMembers, sharedMailboxFolders } from "./shared-mailboxes";
import {
  users,
  userEmailAddresses,
  emailAliases,
  userDomainPermissions,
  userSessions,
} from "./users";

// Collaboration

// Routing

// Audit

// ============================================================
// ORGANIZATION RELATIONS
// ============================================================

export const organizationsRelations = relations(organizations, ({ many }) => ({
  domains: many(domains),
  users: many(users),
  mailboxes: many(mailboxes),
  sharedMailboxes: many(sharedMailboxes),
  distributionLists: many(distributionLists),
  transportRules: many(transportRules),
  auditLogs: many(auditLogs),
  securityEvents: many(securityEvents),
  apiAccessLogs: many(apiAccessLogs),
}));

// ============================================================
// DOMAIN RELATIONS
// ============================================================

export const domainsRelations = relations(domains, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [domains.organizationId],
    references: [organizations.id],
  }),
  dnsRecords: many(domainDnsRecords),
  dkimKeys: many(domainDkimKeys),
  settings: many(domainSettings),
  userEmailAddresses: many(userEmailAddresses),
  emailAliases: many(emailAliases),
  userDomainPermissions: many(userDomainPermissions),
  mailboxes: many(mailboxes),
  sharedMailboxes: many(sharedMailboxes),
  distributionLists: many(distributionLists),
  routingRules: many(domainRoutingRules),
  auditLogs: many(auditLogs),
  routingLogs: many(routingLogs),
}));

export const domainDnsRecordsRelations = relations(domainDnsRecords, ({ one }) => ({
  domain: one(domains, {
    fields: [domainDnsRecords.domainId],
    references: [domains.id],
  }),
}));

export const domainDkimKeysRelations = relations(domainDkimKeys, ({ one }) => ({
  domain: one(domains, {
    fields: [domainDkimKeys.domainId],
    references: [domains.id],
  }),
}));

export const domainSettingsRelations = relations(domainSettings, ({ one }) => ({
  domain: one(domains, {
    fields: [domainSettings.domainId],
    references: [domains.id],
  }),
}));

// ============================================================
// USER RELATIONS
// ============================================================

export const usersRelations = relations(users, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [users.organizationId],
    references: [organizations.id],
  }),
  emailAddresses: many(userEmailAddresses),
  aliases: many(emailAliases),
  domainPermissions: many(userDomainPermissions),
  sessions: many(userSessions),
  mailboxes: many(mailboxes),
  sharedMailboxMemberships: many(sharedMailboxMembers),
  distributionListMemberships: many(distributionListMembers),
  ownedDistributionLists: many(distributionLists),
  auditLogs: many(auditLogs),
  loginAttempts: many(loginAttempts),
  securityEvents: many(securityEvents),
}));

export const userEmailAddressesRelations = relations(userEmailAddresses, ({ one }) => ({
  user: one(users, {
    fields: [userEmailAddresses.userId],
    references: [users.id],
  }),
  domain: one(domains, {
    fields: [userEmailAddresses.domainId],
    references: [domains.id],
  }),
}));

export const emailAliasesRelations = relations(emailAliases, ({ one }) => ({
  user: one(users, {
    fields: [emailAliases.userId],
    references: [users.id],
  }),
  domain: one(domains, {
    fields: [emailAliases.domainId],
    references: [domains.id],
  }),
}));

export const userDomainPermissionsRelations = relations(userDomainPermissions, ({ one }) => ({
  user: one(users, {
    fields: [userDomainPermissions.userId],
    references: [users.id],
  }),
  domain: one(domains, {
    fields: [userDomainPermissions.domainId],
    references: [domains.id],
  }),
}));

export const userSessionsRelations = relations(userSessions, ({ one }) => ({
  user: one(users, {
    fields: [userSessions.userId],
    references: [users.id],
  }),
}));

// ============================================================
// MAILBOX RELATIONS
// ============================================================

export const mailboxesRelations = relations(mailboxes, ({ one, many }) => ({
  domain: one(domains, {
    fields: [mailboxes.domainId],
    references: [domains.id],
  }),
  user: one(users, {
    fields: [mailboxes.userId],
    references: [users.id],
  }),
  folders: many(folders),
  labels: many(labels),
}));

export const foldersRelations = relations(folders, ({ one, many }) => ({
  mailbox: one(mailboxes, {
    fields: [folders.mailboxId],
    references: [mailboxes.id],
  }),
  parent: one(folders, {
    fields: [folders.parentId],
    references: [folders.id],
    relationName: "folderHierarchy",
  }),
  children: many(folders, {
    relationName: "folderHierarchy",
  }),
  rules: many(folderRules),
  emails: many(emails),
}));

export const folderRulesRelations = relations(folderRules, ({ one }) => ({
  folder: one(folders, {
    fields: [folderRules.folderId],
    references: [folders.id],
  }),
}));

// ============================================================
// EMAIL RELATIONS
// ============================================================

export const threadsRelations = relations(threads, ({ one, many }) => ({
  mailbox: one(mailboxes, {
    fields: [threads.mailboxId],
    references: [mailboxes.id],
  }),
  emails: many(emails),
}));

export const emailsRelations = relations(emails, ({ one, many }) => ({
  mailbox: one(mailboxes, {
    fields: [emails.mailboxId],
    references: [mailboxes.id],
  }),
  folder: one(folders, {
    fields: [emails.folderId],
    references: [folders.id],
  }),
  thread: one(threads, {
    fields: [emails.threadId],
    references: [threads.id],
  }),
  attachments: many(emailAttachments),
}));

export const emailAttachmentsRelations = relations(emailAttachments, ({ one }) => ({
  email: one(emails, {
    fields: [emailAttachments.emailId],
    references: [emails.id],
  }),
}));

export const labelsRelations = relations(labels, ({ one }) => ({
  mailbox: one(mailboxes, {
    fields: [labels.mailboxId],
    references: [mailboxes.id],
  }),
}));

// ============================================================
// SHARED MAILBOX RELATIONS
// ============================================================

export const sharedMailboxesRelations = relations(sharedMailboxes, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [sharedMailboxes.organizationId],
    references: [organizations.id],
  }),
  domain: one(domains, {
    fields: [sharedMailboxes.domainId],
    references: [domains.id],
  }),
  createdByUser: one(users, {
    fields: [sharedMailboxes.createdBy],
    references: [users.id],
  }),
  members: many(sharedMailboxMembers),
  folders: many(sharedMailboxFolders),
}));

export const sharedMailboxMembersRelations = relations(sharedMailboxMembers, ({ one }) => ({
  sharedMailbox: one(sharedMailboxes, {
    fields: [sharedMailboxMembers.sharedMailboxId],
    references: [sharedMailboxes.id],
  }),
  user: one(users, {
    fields: [sharedMailboxMembers.userId],
    references: [users.id],
  }),
  addedByUser: one(users, {
    fields: [sharedMailboxMembers.addedBy],
    references: [users.id],
  }),
}));

export const sharedMailboxFoldersRelations = relations(sharedMailboxFolders, ({ one, many }) => ({
  sharedMailbox: one(sharedMailboxes, {
    fields: [sharedMailboxFolders.sharedMailboxId],
    references: [sharedMailboxes.id],
  }),
  parent: one(sharedMailboxFolders, {
    fields: [sharedMailboxFolders.parentId],
    references: [sharedMailboxFolders.id],
    relationName: "sharedFolderHierarchy",
  }),
  children: many(sharedMailboxFolders, {
    relationName: "sharedFolderHierarchy",
  }),
}));

// ============================================================
// DISTRIBUTION LIST RELATIONS
// ============================================================

export const distributionListsRelations = relations(distributionLists, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [distributionLists.organizationId],
    references: [organizations.id],
  }),
  domain: one(domains, {
    fields: [distributionLists.domainId],
    references: [domains.id],
  }),
  owner: one(users, {
    fields: [distributionLists.ownerId],
    references: [users.id],
  }),
  createdByUser: one(users, {
    fields: [distributionLists.createdBy],
    references: [users.id],
  }),
  members: many(distributionListMembers),
  archive: many(distributionListArchive),
}));

export const distributionListMembersRelations = relations(distributionListMembers, ({ one }) => ({
  list: one(distributionLists, {
    fields: [distributionListMembers.listId],
    references: [distributionLists.id],
  }),
  user: one(users, {
    fields: [distributionListMembers.userId],
    references: [users.id],
  }),
  nestedList: one(distributionLists, {
    fields: [distributionListMembers.nestedListId],
    references: [distributionLists.id],
  }),
  addedByUser: one(users, {
    fields: [distributionListMembers.addedBy],
    references: [users.id],
  }),
}));

export const distributionListArchiveRelations = relations(distributionListArchive, ({ one }) => ({
  list: one(distributionLists, {
    fields: [distributionListArchive.listId],
    references: [distributionLists.id],
  }),
  moderator: one(users, {
    fields: [distributionListArchive.moderatedBy],
    references: [users.id],
  }),
}));

// ============================================================
// ROUTING RELATIONS
// ============================================================

export const domainRoutingRulesRelations = relations(domainRoutingRules, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [domainRoutingRules.organizationId],
    references: [organizations.id],
  }),
  domain: one(domains, {
    fields: [domainRoutingRules.domainId],
    references: [domains.id],
  }),
  createdByUser: one(users, {
    fields: [domainRoutingRules.createdBy],
    references: [users.id],
  }),
  logs: many(routingLogs),
}));

export const transportRulesRelations = relations(transportRules, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [transportRules.organizationId],
    references: [organizations.id],
  }),
  createdByUser: one(users, {
    fields: [transportRules.createdBy],
    references: [users.id],
  }),
  logs: many(routingLogs),
}));

export const routingLogsRelations = relations(routingLogs, ({ one }) => ({
  organization: one(organizations, {
    fields: [routingLogs.organizationId],
    references: [organizations.id],
  }),
  domain: one(domains, {
    fields: [routingLogs.domainId],
    references: [domains.id],
  }),
  domainRule: one(domainRoutingRules, {
    fields: [routingLogs.domainRuleId],
    references: [domainRoutingRules.id],
  }),
  transportRule: one(transportRules, {
    fields: [routingLogs.transportRuleId],
    references: [transportRules.id],
  }),
}));

// ============================================================
// AUDIT RELATIONS
// ============================================================

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  organization: one(organizations, {
    fields: [auditLogs.organizationId],
    references: [organizations.id],
  }),
  domain: one(domains, {
    fields: [auditLogs.domainId],
    references: [domains.id],
  }),
  user: one(users, {
    fields: [auditLogs.userId],
    references: [users.id],
  }),
}));

export const loginAttemptsRelations = relations(loginAttempts, ({ one }) => ({
  organization: one(organizations, {
    fields: [loginAttempts.organizationId],
    references: [organizations.id],
  }),
  user: one(users, {
    fields: [loginAttempts.userId],
    references: [users.id],
  }),
}));

export const securityEventsRelations = relations(securityEvents, ({ one }) => ({
  organization: one(organizations, {
    fields: [securityEvents.organizationId],
    references: [organizations.id],
  }),
  user: one(users, {
    fields: [securityEvents.userId],
    references: [users.id],
  }),
  acknowledgedByUser: one(users, {
    fields: [securityEvents.acknowledgedBy],
    references: [users.id],
  }),
  resolvedByUser: one(users, {
    fields: [securityEvents.resolvedBy],
    references: [users.id],
  }),
}));

export const apiAccessLogsRelations = relations(apiAccessLogs, ({ one }) => ({
  organization: one(organizations, {
    fields: [apiAccessLogs.organizationId],
    references: [organizations.id],
  }),
  user: one(users, {
    fields: [apiAccessLogs.userId],
    references: [users.id],
  }),
}));
