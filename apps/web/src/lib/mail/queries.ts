/**
 * Mail Database Queries
 * Direct PostgreSQL queries for mail operations (mail_folders, mail_messages tables)
 */
import { getDb } from "../db";

// ===========================================================================
// Types
// ===========================================================================

export interface DbMailbox {
  id: string;
  userId: string;
  domainId: string | null;
  email: string;
  displayName: string | null;
  quotaBytes: number;
  usedBytes: number;
}

export interface DbFolder {
  id: string;
  mailboxId: string;
  name: string;
  fullPath: string;
  parentId: string | null;
  specialUse: string | null;
  uidValidity: number;
  uidNext: number;
  messageCount: number;
  unseenCount: number;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface DbMessage {
  id: string;
  folderId: string;
  mailboxId: string;
  uid: number;
  messageId: string | null;
  inReplyTo: string | null;
  referencesHeader: string | null;
  subject: string;
  sender: { address: string; name?: string };
  recipientsTo: { address: string; name?: string }[];
  recipientsCc: { address: string; name?: string }[];
  recipientsBcc: { address: string; name?: string }[];
  replyTo: string | null;
  date: Date;
  size: number;
  flags: string[];
  snippet: string;
  textBody: string | null;
  htmlBody: string | null;
  rawHeaders: Record<string, string> | null;
  bodyPath: string | null;
  createdAt: Date;
}

export interface DbDomain {
  id: string;
  name: string;
  displayName: string;
  isPrimary: boolean;
}

// ===========================================================================
// Folder ↔ type mapping
// ===========================================================================

const SPECIAL_USE_TO_FOLDER: Record<string, string> = {
  "\\Inbox": "inbox",
  "\\Sent": "sent",
  "\\Drafts": "drafts",
  "\\Trash": "trash",
  "\\Junk": "spam",
  "\\Archive": "archive",
};

const FOLDER_TO_SPECIAL_USE: Record<string, string> = {
  inbox: "\\Inbox",
  sent: "\\Sent",
  drafts: "\\Drafts",
  trash: "\\Trash",
  spam: "\\Junk",
  archive: "\\Archive",
};

export function specialUseToFolderType(specialUse: string | null): string {
  if (!specialUse) return "custom";
  return SPECIAL_USE_TO_FOLDER[specialUse] ?? "custom";
}

export function folderTypeToSpecialUse(folderType: string): string | null {
  return FOLDER_TO_SPECIAL_USE[folderType] ?? null;
}

// ===========================================================================
// Mailbox queries
// ===========================================================================

/** Get all mailboxes for a user */
export async function getUserMailboxes(userId: string): Promise<DbMailbox[]> {
  const sql = getDb();
  const rows = await sql`
    SELECT id, user_id as "userId", domain_id as "domainId", email,
           display_name as "displayName", quota_bytes as "quotaBytes",
           used_bytes as "usedBytes"
    FROM mailboxes
    WHERE user_id = ${userId} AND email IS NOT NULL AND is_active = true
    ORDER BY email
  `;
  return rows as unknown as DbMailbox[];
}

/** Get mailbox IDs for a user, optionally filtered by domain */
export async function getUserMailboxIds(userId: string, domainId?: string): Promise<string[]> {
  const sql = getDb();
  let rows;
  if (domainId && domainId !== "all") {
    rows = await sql`
      SELECT id FROM mailboxes
      WHERE user_id = ${userId} AND domain_id = ${domainId}
        AND email IS NOT NULL AND is_active = true
    `;
  } else {
    rows = await sql`
      SELECT id FROM mailboxes
      WHERE user_id = ${userId} AND email IS NOT NULL AND is_active = true
    `;
  }
  return rows.map((r) => (r as { id: string }).id);
}

// ===========================================================================
// Domain queries
// ===========================================================================

/** Get domains associated with user's mailboxes */
export async function getUserDomains(userId: string): Promise<DbDomain[]> {
  const sql = getDb();
  const rows = await sql`
    SELECT DISTINCT d.id, d.name, d.display_name as "displayName", d.is_primary as "isPrimary"
    FROM domains d
    JOIN mailboxes m ON m.domain_id = d.id
    WHERE m.user_id = ${userId} AND m.email IS NOT NULL AND m.is_active = true
    ORDER BY d.name
  `;
  return rows as unknown as DbDomain[];
}

// ===========================================================================
// Folder queries
// ===========================================================================

/** Get all folders for given mailbox IDs */
export async function getFolders(mailboxIds: string[]): Promise<DbFolder[]> {
  if (mailboxIds.length === 0) return [];
  const sql = getDb();
  const rows = await sql`
    SELECT id, mailbox_id as "mailboxId", name, full_path as "fullPath",
           parent_id as "parentId", special_use as "specialUse",
           uid_validity as "uidValidity", uid_next as "uidNext",
           message_count as "messageCount", unseen_count as "unseenCount",
           sort_order as "sortOrder", created_at as "createdAt", updated_at as "updatedAt"
    FROM mail_folders
    WHERE mailbox_id = ANY(${mailboxIds})
    ORDER BY sort_order, name
  `;
  return rows as unknown as DbFolder[];
}

/** Get a folder by ID */
export async function getFolderById(folderId: string): Promise<DbFolder | null> {
  const sql = getDb();
  const rows = await sql`
    SELECT id, mailbox_id as "mailboxId", name, full_path as "fullPath",
           parent_id as "parentId", special_use as "specialUse",
           uid_validity as "uidValidity", uid_next as "uidNext",
           message_count as "messageCount", unseen_count as "unseenCount",
           sort_order as "sortOrder", created_at as "createdAt", updated_at as "updatedAt"
    FROM mail_folders WHERE id = ${folderId}
  `;
  return (rows[0] as unknown as DbFolder) ?? null;
}

/** Get folder by special use for a mailbox */
export async function getFolderBySpecialUse(
  mailboxId: string,
  specialUse: string
): Promise<DbFolder | null> {
  const sql = getDb();
  const rows = await sql`
    SELECT id, mailbox_id as "mailboxId", name, full_path as "fullPath",
           parent_id as "parentId", special_use as "specialUse",
           uid_validity as "uidValidity", uid_next as "uidNext",
           message_count as "messageCount", unseen_count as "unseenCount",
           sort_order as "sortOrder", created_at as "createdAt", updated_at as "updatedAt"
    FROM mail_folders
    WHERE mailbox_id = ${mailboxId} AND special_use = ${specialUse}
    LIMIT 1
  `;
  return (rows[0] as unknown as DbFolder) ?? null;
}

/** Create a folder */
export async function createFolder(params: {
  mailboxId: string;
  name: string;
  fullPath: string;
  parentId?: string;
  specialUse?: string;
  sortOrder?: number;
}): Promise<DbFolder> {
  const sql = getDb();
  const rows = await sql`
    INSERT INTO mail_folders (mailbox_id, name, full_path, parent_id, special_use, sort_order)
    VALUES (${params.mailboxId}, ${params.name}, ${params.fullPath},
            ${params.parentId ?? null}, ${params.specialUse ?? null}, ${params.sortOrder ?? 99})
    RETURNING id, mailbox_id as "mailboxId", name, full_path as "fullPath",
              parent_id as "parentId", special_use as "specialUse",
              uid_validity as "uidValidity", uid_next as "uidNext",
              message_count as "messageCount", unseen_count as "unseenCount",
              sort_order as "sortOrder", created_at as "createdAt", updated_at as "updatedAt"
  `;
  return rows[0] as unknown as DbFolder;
}

/** Rename a folder */
export async function renameFolder(folderId: string, name: string): Promise<DbFolder | null> {
  const sql = getDb();
  const rows = await sql`
    UPDATE mail_folders SET name = ${name}, full_path = ${name}
    WHERE id = ${folderId} AND special_use IS NULL
    RETURNING id, mailbox_id as "mailboxId", name, full_path as "fullPath",
              parent_id as "parentId", special_use as "specialUse",
              uid_validity as "uidValidity", uid_next as "uidNext",
              message_count as "messageCount", unseen_count as "unseenCount",
              sort_order as "sortOrder", created_at as "createdAt", updated_at as "updatedAt"
  `;
  return (rows[0] as unknown as DbFolder) ?? null;
}

/** Delete a folder (only custom folders) */
export async function deleteFolder(folderId: string): Promise<boolean> {
  const sql = getDb();
  const result = await sql`
    DELETE FROM mail_folders WHERE id = ${folderId} AND special_use IS NULL
  `;
  return result.count > 0;
}

// ===========================================================================
// Message queries
// ===========================================================================

/** List messages with pagination and filtering */
export async function listMessages(params: {
  mailboxIds: string[];
  folder?: string;
  folderId?: string;
  page: number;
  pageSize: number;
  search?: string;
  starred?: boolean;
  read?: boolean;
  sortBy?: string;
  sortOrder?: string;
}): Promise<{ messages: DbMessage[]; total: number }> {
  if (params.mailboxIds.length === 0) return { messages: [], total: 0 };

  const sql = getDb();
  const offset = (params.page - 1) * params.pageSize;

  // Special case: starred = cross-folder flag query
  if (params.folder === "starred" || params.starred) {
    const countResult = await sql`
      SELECT COUNT(*)::int as count FROM mail_messages
      WHERE mailbox_id = ANY(${params.mailboxIds})
        AND flags @> '["\\\\Flagged"]'::jsonb
    `;
    const total = (countResult[0] as unknown as { count: number }).count;

    const rows = await sql`
      SELECT id, folder_id as "folderId", mailbox_id as "mailboxId", uid,
             message_id as "messageId", in_reply_to as "inReplyTo",
             references_header as "referencesHeader", subject, sender,
             recipients_to as "recipientsTo", recipients_cc as "recipientsCc",
             recipients_bcc as "recipientsBcc", reply_to as "replyTo",
             date, size, flags, snippet, text_body as "textBody",
             html_body as "htmlBody", raw_headers as "rawHeaders",
             body_path as "bodyPath", created_at as "createdAt"
      FROM mail_messages
      WHERE mailbox_id = ANY(${params.mailboxIds})
        AND flags @> '["\\\\Flagged"]'::jsonb
      ORDER BY date DESC
      LIMIT ${params.pageSize} OFFSET ${offset}
    `;
    return { messages: rows as unknown as DbMessage[], total };
  }

  // Determine folder IDs to query
  let folderIds: string[] = [];

  if (params.folderId) {
    folderIds = [params.folderId];
  } else if (params.folder && params.folder !== "all") {
    const specialUse = folderTypeToSpecialUse(params.folder);
    if (specialUse) {
      const folderRows = await sql`
        SELECT id FROM mail_folders
        WHERE mailbox_id = ANY(${params.mailboxIds}) AND special_use = ${specialUse}
      `;
      folderIds = folderRows.map((r) => (r as { id: string }).id);
    }
  } else {
    // Default to Inbox
    const folderRows = await sql`
      SELECT id FROM mail_folders
      WHERE mailbox_id = ANY(${params.mailboxIds}) AND special_use = '\\Inbox'
    `;
    folderIds = folderRows.map((r) => (r as { id: string }).id);
  }

  if (folderIds.length === 0) return { messages: [], total: 0 };

  // Build search condition
  const searchCondition = params.search
    ? sql`AND (subject ILIKE ${`%${params.search}%`} OR sender::text ILIKE ${`%${params.search}%`})`
    : sql``;

  const readCondition =
    params.read === true
      ? sql`AND flags @> '["\\\\Seen"]'::jsonb`
      : params.read === false
        ? sql`AND NOT flags @> '["\\\\Seen"]'::jsonb`
        : sql``;

  // Count total
  const countResult = await sql`
    SELECT COUNT(*)::int as count FROM mail_messages
    WHERE folder_id = ANY(${folderIds}) ${searchCondition} ${readCondition}
  `;
  const total = (countResult[0] as unknown as { count: number }).count;

  // Fetch messages
  const rows = await sql`
    SELECT id, folder_id as "folderId", mailbox_id as "mailboxId", uid,
           message_id as "messageId", in_reply_to as "inReplyTo",
           references_header as "referencesHeader", subject, sender,
           recipients_to as "recipientsTo", recipients_cc as "recipientsCc",
           recipients_bcc as "recipientsBcc", reply_to as "replyTo",
           date, size, flags, snippet, text_body as "textBody",
           html_body as "htmlBody", raw_headers as "rawHeaders",
           body_path as "bodyPath", created_at as "createdAt"
    FROM mail_messages
    WHERE folder_id = ANY(${folderIds}) ${searchCondition} ${readCondition}
    ORDER BY date DESC
    LIMIT ${params.pageSize} OFFSET ${offset}
  `;

  return { messages: rows as unknown as DbMessage[], total };
}

/** Get a single message by ID */
export async function getMessage(messageId: string): Promise<DbMessage | null> {
  const sql = getDb();
  const rows = await sql`
    SELECT id, folder_id as "folderId", mailbox_id as "mailboxId", uid,
           message_id as "messageId", in_reply_to as "inReplyTo",
           references_header as "referencesHeader", subject, sender,
           recipients_to as "recipientsTo", recipients_cc as "recipientsCc",
           recipients_bcc as "recipientsBcc", reply_to as "replyTo",
           date, size, flags, snippet, text_body as "textBody",
           html_body as "htmlBody", raw_headers as "rawHeaders",
           body_path as "bodyPath", created_at as "createdAt"
    FROM mail_messages WHERE id = ${messageId}
  `;
  return (rows[0] as unknown as DbMessage) ?? null;
}

/** Update flags on messages */
export async function updateMessageFlags(
  messageIds: string[],
  addFlags: string[],
  removeFlags: string[]
): Promise<number> {
  if (messageIds.length === 0) return 0;
  const sql = getDb();

  if (addFlags.length > 0 && removeFlags.length > 0) {
    // Add some, remove others
    const result = await sql`
      UPDATE mail_messages
      SET flags = (
        SELECT jsonb_agg(DISTINCT f)
        FROM (
          SELECT jsonb_array_elements(flags) AS f
          UNION ALL
          SELECT jsonb_array_elements(${JSON.stringify(addFlags)}::jsonb) AS f
        ) sub
        WHERE f::text NOT IN (SELECT jsonb_array_elements_text(${JSON.stringify(removeFlags)}::jsonb))
      )
      WHERE id = ANY(${messageIds})
    `;
    return result.count;
  } else if (addFlags.length > 0) {
    const result = await sql`
      UPDATE mail_messages
      SET flags = (
        SELECT COALESCE(jsonb_agg(DISTINCT f), '[]'::jsonb)
        FROM (
          SELECT jsonb_array_elements(flags) AS f
          UNION ALL
          SELECT jsonb_array_elements(${JSON.stringify(addFlags)}::jsonb) AS f
        ) sub
      )
      WHERE id = ANY(${messageIds})
    `;
    return result.count;
  } else if (removeFlags.length > 0) {
    const result = await sql`
      UPDATE mail_messages
      SET flags = (
        SELECT COALESCE(jsonb_agg(f), '[]'::jsonb)
        FROM jsonb_array_elements(flags) AS f
        WHERE f::text NOT IN (SELECT jsonb_array_elements_text(${JSON.stringify(removeFlags)}::jsonb))
      )
      WHERE id = ANY(${messageIds})
    `;
    return result.count;
  }
  return 0;
}

/** Move messages to a different folder */
export async function moveMessages(messageIds: string[], targetFolderId: string): Promise<number> {
  if (messageIds.length === 0) return 0;
  const sql = getDb();
  const result = await sql`
    UPDATE mail_messages SET folder_id = ${targetFolderId}
    WHERE id = ANY(${messageIds})
  `;
  // Update folder counts
  await refreshFolderCounts(targetFolderId);
  return result.count;
}

/** Delete messages permanently */
export async function deleteMessages(messageIds: string[]): Promise<number> {
  if (messageIds.length === 0) return 0;
  const sql = getDb();

  // Get affected folder IDs before deleting
  const folderRows = await sql`
    SELECT DISTINCT folder_id FROM mail_messages WHERE id = ANY(${messageIds})
  `;
  const folderIds = folderRows.map((r) => (r as { folder_id: string }).folder_id);

  const result = await sql`DELETE FROM mail_messages WHERE id = ANY(${messageIds})`;

  // Update counts for affected folders
  for (const fid of folderIds) {
    await refreshFolderCounts(fid);
  }
  return result.count;
}

/** Move messages to trash (or delete permanently if already in trash) */
export async function trashMessages(
  messageIds: string[],
  mailboxIds: string[]
): Promise<{ moved: number; deleted: number }> {
  if (messageIds.length === 0) return { moved: 0, deleted: 0 };
  const sql = getDb();

  // Find trash folder IDs for the user's mailboxes
  const trashFolders = await sql`
    SELECT id, mailbox_id as "mailboxId" FROM mail_folders
    WHERE mailbox_id = ANY(${mailboxIds}) AND special_use = '\\Trash'
  `;
  const trashByMailbox = new Map(
    (trashFolders as unknown as { id: string; mailboxId: string }[]).map((f) => [f.mailboxId, f.id])
  );

  // Check which messages are already in trash
  const messages = await sql`
    SELECT mm.id, mm.mailbox_id as "mailboxId", mm.folder_id as "folderId",
           mf.special_use as "specialUse"
    FROM mail_messages mm
    JOIN mail_folders mf ON mm.folder_id = mf.id
    WHERE mm.id = ANY(${messageIds})
  `;

  const toDelete: string[] = [];
  const toMove: { id: string; trashId: string }[] = [];

  for (const msg of messages as unknown as {
    id: string;
    mailboxId: string;
    folderId: string;
    specialUse: string | null;
  }[]) {
    if (msg.specialUse === "\\Trash") {
      toDelete.push(msg.id);
    } else {
      const trashId = trashByMailbox.get(msg.mailboxId);
      if (trashId) toMove.push({ id: msg.id, trashId });
    }
  }

  let deleted = 0;
  let moved = 0;

  if (toDelete.length > 0) {
    const res = await sql`DELETE FROM mail_messages WHERE id = ANY(${toDelete})`;
    deleted = res.count;
  }

  if (toMove.length > 0) {
    // Group by target trash folder
    const byTrash = new Map<string, string[]>();
    for (const m of toMove) {
      const arr = byTrash.get(m.trashId) ?? [];
      arr.push(m.id);
      byTrash.set(m.trashId, arr);
    }
    for (const [trashId, ids] of byTrash) {
      const res = await sql`
        UPDATE mail_messages SET folder_id = ${trashId} WHERE id = ANY(${ids})
      `;
      moved += res.count;
      await refreshFolderCounts(trashId);
    }
  }

  return { moved, deleted };
}

/** Insert a new message */
export async function insertMessage(params: {
  folderId: string;
  mailboxId: string;
  messageId?: string;
  inReplyTo?: string;
  referencesHeader?: string;
  subject: string;
  sender: { address: string; name?: string };
  recipientsTo: { address: string; name?: string }[];
  recipientsCc?: { address: string; name?: string }[];
  recipientsBcc?: { address: string; name?: string }[];
  replyTo?: string;
  date?: Date;
  size?: number;
  flags?: string[];
  snippet?: string;
  textBody?: string;
  htmlBody?: string;
  rawHeaders?: Record<string, string>;
}): Promise<DbMessage> {
  const sql = getDb();

  // Get next UID for this folder
  const uidResult = await sql`
    UPDATE mail_folders SET uid_next = uid_next + 1
    WHERE id = ${params.folderId}
    RETURNING uid_next - 1 as uid
  `;
  const uid = (uidResult[0] as unknown as { uid: number }).uid;

  const rows = await sql`
    INSERT INTO mail_messages (
      folder_id, mailbox_id, uid, message_id, in_reply_to, references_header,
      subject, sender, recipients_to, recipients_cc, recipients_bcc,
      reply_to, date, size, flags, snippet, text_body, html_body, raw_headers
    ) VALUES (
      ${params.folderId}, ${params.mailboxId}, ${uid},
      ${params.messageId ?? null}, ${params.inReplyTo ?? null},
      ${params.referencesHeader ?? null}, ${params.subject},
      ${JSON.stringify(params.sender)}::jsonb,
      ${JSON.stringify(params.recipientsTo)}::jsonb,
      ${JSON.stringify(params.recipientsCc ?? [])}::jsonb,
      ${JSON.stringify(params.recipientsBcc ?? [])}::jsonb,
      ${params.replyTo ?? null},
      ${params.date ?? new Date()},
      ${params.size ?? 0},
      ${JSON.stringify(params.flags ?? ["\\Seen"])}::jsonb,
      ${params.snippet ?? ""},
      ${params.textBody ?? null},
      ${params.htmlBody ?? null},
      ${params.rawHeaders ? JSON.stringify(params.rawHeaders) : null}::jsonb
    )
    RETURNING id, folder_id as "folderId", mailbox_id as "mailboxId", uid,
              message_id as "messageId", in_reply_to as "inReplyTo",
              references_header as "referencesHeader", subject, sender,
              recipients_to as "recipientsTo", recipients_cc as "recipientsCc",
              recipients_bcc as "recipientsBcc", reply_to as "replyTo",
              date, size, flags, snippet, text_body as "textBody",
              html_body as "htmlBody", raw_headers as "rawHeaders",
              body_path as "bodyPath", created_at as "createdAt"
  `;

  // Update folder counts
  await refreshFolderCounts(params.folderId);

  return rows[0] as unknown as DbMessage;
}

/** Refresh message_count and unseen_count for a folder */
export async function refreshFolderCounts(folderId: string): Promise<void> {
  const sql = getDb();
  await sql`
    UPDATE mail_folders SET
      message_count = (SELECT COUNT(*)::int FROM mail_messages WHERE folder_id = ${folderId}),
      unseen_count = (SELECT COUNT(*)::int FROM mail_messages WHERE folder_id = ${folderId}
                      AND NOT flags @> '["\\\\Seen"]'::jsonb)
    WHERE id = ${folderId}
  `;
}

/** Refresh counts for all folders of given mailboxes */
export async function refreshAllFolderCounts(mailboxIds: string[]): Promise<void> {
  if (mailboxIds.length === 0) return;
  const sql = getDb();
  await sql`
    UPDATE mail_folders mf SET
      message_count = COALESCE((SELECT COUNT(*)::int FROM mail_messages WHERE folder_id = mf.id), 0),
      unseen_count = COALESCE((SELECT COUNT(*)::int FROM mail_messages WHERE folder_id = mf.id
                               AND NOT flags @> '["\\\\Seen"]'::jsonb), 0)
    WHERE mf.mailbox_id = ANY(${mailboxIds})
  `;
}

// ===========================================================================
// Unread counts
// ===========================================================================

export interface UnreadCountResult {
  total: number;
  byDomain: Record<string, number>;
  byMailbox: Record<string, number>;
  byFolder: Record<string, number>;
}

/** Get unread counts grouped by domain, mailbox, and folder */
export async function getUnreadCounts(mailboxIds: string[]): Promise<UnreadCountResult> {
  if (mailboxIds.length === 0) {
    return { total: 0, byDomain: {}, byMailbox: {}, byFolder: {} };
  }

  const sql = getDb();

  // Get total and per-folder counts from mail_folders
  const rows = await sql`
    SELECT mf.id as "folderId", mf.mailbox_id as "mailboxId",
           mf.unseen_count as "unseenCount", mf.special_use as "specialUse",
           mb.domain_id as "domainId"
    FROM mail_folders mf
    JOIN mailboxes mb ON mf.mailbox_id = mb.id
    WHERE mf.mailbox_id = ANY(${mailboxIds})
  `;

  const result: UnreadCountResult = { total: 0, byDomain: {}, byMailbox: {}, byFolder: {} };

  for (const row of rows as unknown as {
    folderId: string;
    mailboxId: string;
    unseenCount: number;
    specialUse: string | null;
    domainId: string | null;
  }[]) {
    // Only count inbox unseen for total
    if (row.specialUse === "\\Inbox") {
      result.total += row.unseenCount;
    }
    result.byFolder[row.folderId] = row.unseenCount;
    result.byMailbox[row.mailboxId] = (result.byMailbox[row.mailboxId] ?? 0) + row.unseenCount;
    if (row.domainId) {
      result.byDomain[row.domainId] = (result.byDomain[row.domainId] ?? 0) + row.unseenCount;
    }
  }

  return result;
}

// ===========================================================================
// Auto-provision helpers
// ===========================================================================

/** Ensure a user has a mailbox and default folders. Returns mailbox IDs. */
export async function ensureUserMailbox(userId: string, email: string): Promise<string[]> {
  const sql = getDb();

  // Check if user already has a mailbox
  const existing = await sql`
    SELECT id FROM mailboxes WHERE user_id = ${userId} AND email IS NOT NULL AND is_active = true
  `;
  if (existing.length > 0) {
    // Make sure folders exist
    const mailboxIds = existing.map((r) => (r as { id: string }).id);
    for (const mid of mailboxIds) {
      await ensureDefaultFolders(mid);
    }
    return mailboxIds;
  }

  // Find domain
  const domain = email.split("@")[1] ?? "";
  const domainRows = await sql`SELECT id FROM domains WHERE name = ${domain} LIMIT 1`;
  const domainId = domainRows.length > 0 ? (domainRows[0] as { id: string }).id : null;

  // Create mailbox
  const mbRows = await sql`
    INSERT INTO mailboxes (id, user_id, domain_id, email, display_name)
    VALUES (gen_random_uuid(), ${userId}, ${domainId}, ${email}, ${email.split("@")[0] ?? email})
    ON CONFLICT (email) DO UPDATE SET is_active = true
    RETURNING id
  `;
  const mailboxId = (mbRows[0] as { id: string }).id;
  await ensureDefaultFolders(mailboxId);

  return [mailboxId];
}

/** Ensure default system folders exist for a mailbox */
async function ensureDefaultFolders(mailboxId: string): Promise<void> {
  const sql = getDb();
  const defaultFolders = [
    { name: "Inbox", fullPath: "INBOX", specialUse: "\\Inbox", sortOrder: 0 },
    { name: "Sent", fullPath: "Sent", specialUse: "\\Sent", sortOrder: 1 },
    { name: "Drafts", fullPath: "Drafts", specialUse: "\\Drafts", sortOrder: 2 },
    { name: "Trash", fullPath: "Trash", specialUse: "\\Trash", sortOrder: 3 },
    { name: "Spam", fullPath: "Spam", specialUse: "\\Junk", sortOrder: 4 },
    { name: "Archive", fullPath: "Archive", specialUse: "\\Archive", sortOrder: 5 },
  ];

  for (const f of defaultFolders) {
    await sql`
      INSERT INTO mail_folders (mailbox_id, name, full_path, special_use, sort_order)
      VALUES (${mailboxId}, ${f.name}, ${f.fullPath}, ${f.specialUse}, ${f.sortOrder})
      ON CONFLICT (mailbox_id, full_path) DO NOTHING
    `;
  }
}
