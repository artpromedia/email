/**
 * Multi-Domain Mail Store
 * Zustand store for mail state management
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";

import type {
  Domain,
  Mailbox,
  SharedMailbox,
  MailFolder,
  EmailListItem,
  EmailListQuery,
  ViewMode,
  ViewPreferences,
  MoveDestination,
  UnreadCountUpdate,
} from "./types";

// ============================================================
// STATE INTERFACE
// ============================================================

interface MailState {
  // Domain & Mailbox Data
  domains: Domain[];
  activeDomain: string;
  activeMailbox: Mailbox | SharedMailbox | null;
  activeFolder: MailFolder | null;

  // Email List
  emails: EmailListItem[];
  selectedEmails: Set<string>;
  focusedEmailId: string | null;
  isLoading: boolean;
  error: string | null;

  // Query State
  query: EmailListQuery;

  // View Preferences
  viewPreferences: ViewPreferences;

  // Sidebar State
  expandedDomains: Set<string>;
  sidebarCollapsed: boolean;

  // Compose State
  defaultFromAddress: string | null;
}

// ============================================================
// ACTIONS INTERFACE
// ============================================================

interface MailActions {
  // Domain Actions
  setDomains: (domains: Domain[]) => void;
  setActiveDomain: (domainId: string) => void;
  toggleDomainExpanded: (domainId: string) => void;

  // Mailbox Actions
  setActiveMailbox: (mailbox: Mailbox | SharedMailbox | null) => void;
  setActiveFolder: (folder: MailFolder | null) => void;

  // Email List Actions
  setEmails: (emails: EmailListItem[]) => void;
  addEmails: (emails: EmailListItem[]) => void;
  updateEmail: (emailId: string, updates: Partial<EmailListItem>) => void;
  removeEmails: (emailIds: string[]) => void;

  // Selection Actions
  selectEmail: (emailId: string) => void;
  deselectEmail: (emailId: string) => void;
  toggleEmailSelection: (emailId: string) => void;
  selectAllEmails: () => void;
  clearSelection: () => void;
  setFocusedEmail: (emailId: string | null) => void;

  // Query Actions
  setQuery: (query: Partial<EmailListQuery>) => void;
  resetQuery: () => void;

  // View Preferences Actions
  setViewMode: (mode: ViewMode) => void;
  setViewPreferences: (prefs: Partial<ViewPreferences>) => void;
  toggleSidebar: () => void;

  // Loading/Error Actions
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  // Unread Count Actions
  updateUnreadCount: (update: UnreadCountUpdate) => void;
  incrementUnreadCount: (domainId: string, mailboxId: string, folderId: string) => void;
  decrementUnreadCount: (domainId: string, mailboxId: string, folderId: string) => void;

  // Compose Actions
  setDefaultFromAddress: (address: string | null) => void;

  // Bulk Actions
  markAsRead: (emailIds: string[]) => void;
  markAsUnread: (emailIds: string[]) => void;
  starEmails: (emailIds: string[]) => void;
  unstarEmails: (emailIds: string[]) => void;
  moveEmails: (emailIds: string[], destination: MoveDestination) => void;
  deleteEmails: (emailIds: string[]) => void;
}

// ============================================================
// DEFAULT VALUES
// ============================================================

const defaultQuery: EmailListQuery = {
  domain: "all",
  folder: "inbox",
  page: 1,
  pageSize: 50,
  sortBy: "date",
  sortOrder: "desc",
};

const defaultViewPreferences: ViewPreferences = {
  mode: "unified",
  activeDomain: "all",
  showUnreadOnly: false,
  previewPane: "right",
  density: "comfortable",
  groupByConversation: true,
};

// ============================================================
// STORE CREATION
// ============================================================

export const useMailStore = create<MailState & MailActions>()(
  persist(
    immer((set, _get) => ({
      // Initial State
      domains: [],
      activeDomain: "all",
      activeMailbox: null,
      activeFolder: null,
      emails: [],
      selectedEmails: new Set<string>(),
      focusedEmailId: null,
      isLoading: false,
      error: null,
      query: defaultQuery,
      viewPreferences: defaultViewPreferences,
      expandedDomains: new Set<string>(),
      sidebarCollapsed: false,
      defaultFromAddress: null,

      // Domain Actions
      setDomains: (domains) =>
        set((state) => {
          state.domains = domains;
          // Auto-expand first domain
          if (domains.length > 0 && state.expandedDomains.size === 0) {
            const firstDomain = domains[0];
            if (firstDomain) {
              state.expandedDomains = new Set([firstDomain.id]);
            }
          }
        }),

      setActiveDomain: (domainId) =>
        set((state) => {
          state.activeDomain = domainId;
          state.query.domain = domainId;
          state.viewPreferences.activeDomain = domainId;
          state.viewPreferences.mode = domainId === "all" ? "unified" : "domain";
          // Clear selection when switching domains
          state.selectedEmails = new Set();
          state.focusedEmailId = null;
          // Set default from address
          if (domainId !== "all") {
            const domain = state.domains.find((d) => d.id === domainId);
            if (domain && domain.mailboxes.length > 0) {
              const defaultMailbox =
                domain.mailboxes.find((m) => m.isDefault) ?? domain.mailboxes[0];
              if (defaultMailbox) {
                state.defaultFromAddress = defaultMailbox.email;
              }
            }
          }
        }),

      toggleDomainExpanded: (domainId) =>
        set((state) => {
          const newExpanded = new Set(state.expandedDomains);
          if (newExpanded.has(domainId)) {
            newExpanded.delete(domainId);
          } else {
            newExpanded.add(domainId);
          }
          state.expandedDomains = newExpanded;
        }),

      // Mailbox Actions
      setActiveMailbox: (mailbox) =>
        set((state) => {
          state.activeMailbox = mailbox;
          if (mailbox) {
            state.viewPreferences.activeMailbox = mailbox.id;
            state.defaultFromAddress = mailbox.email;
          }
        }),

      setActiveFolder: (folder) =>
        set((state) => {
          state.activeFolder = folder;
          if (folder) {
            if (folder.type === "custom") {
              state.query.folder = "custom";
              state.query.folderId = folder.id;
            } else {
              state.query.folder = folder.type;
            }
          }
        }),

      // Email List Actions
      setEmails: (emails) =>
        set((state) => {
          state.emails = emails;
        }),

      addEmails: (emails) =>
        set((state) => {
          // Add to beginning (newest first)
          state.emails = [...emails, ...state.emails];
        }),

      updateEmail: (emailId, updates) =>
        set((state) => {
          const index = state.emails.findIndex((e) => e.id === emailId);
          if (index !== -1) {
            const email = state.emails[index];
            // Use Object.keys to iterate and assign each property
            (Object.keys(updates) as Array<keyof typeof updates>).forEach((key) => {
              if (updates[key] !== undefined) {
                // @ts-expect-error - Immer draft typing limitation
                email[key] = updates[key];
              }
            });
          }
        }),

      removeEmails: (emailIds) =>
        set((state) => {
          const idsSet = new Set(emailIds);
          state.emails = state.emails.filter((e) => !idsSet.has(e.id));
          // Clear from selection
          emailIds.forEach((id) => state.selectedEmails.delete(id));
          if (state.focusedEmailId && idsSet.has(state.focusedEmailId)) {
            state.focusedEmailId = null;
          }
        }),

      // Selection Actions
      selectEmail: (emailId) =>
        set((state) => {
          state.selectedEmails.add(emailId);
        }),

      deselectEmail: (emailId) =>
        set((state) => {
          state.selectedEmails.delete(emailId);
        }),

      toggleEmailSelection: (emailId) =>
        set((state) => {
          if (state.selectedEmails.has(emailId)) {
            state.selectedEmails.delete(emailId);
          } else {
            state.selectedEmails.add(emailId);
          }
        }),

      selectAllEmails: () =>
        set((state) => {
          state.selectedEmails = new Set(state.emails.map((e) => e.id));
        }),

      clearSelection: () =>
        set((state) => {
          state.selectedEmails = new Set();
        }),

      setFocusedEmail: (emailId) =>
        set((state) => {
          state.focusedEmailId = emailId;
        }),

      // Query Actions
      setQuery: (query) =>
        set((state) => {
          state.query = { ...state.query, ...query };
        }),

      resetQuery: () =>
        set((state) => {
          state.query = { ...defaultQuery, domain: state.activeDomain };
        }),

      // View Preferences Actions
      setViewMode: (mode) =>
        set((state) => {
          state.viewPreferences.mode = mode;
        }),

      setViewPreferences: (prefs) =>
        set((state) => {
          state.viewPreferences = { ...state.viewPreferences, ...prefs };
        }),

      toggleSidebar: () =>
        set((state) => {
          state.sidebarCollapsed = !state.sidebarCollapsed;
        }),

      // Loading/Error Actions
      setLoading: (loading) =>
        set((state) => {
          state.isLoading = loading;
        }),

      setError: (error) =>
        set((state) => {
          state.error = error;
        }),

      // Unread Count Actions
      updateUnreadCount: (update) =>
        set((state) => {
          const domain = state.domains.find((d) => d.id === update.domainId);
          if (domain) {
            // Update mailbox
            const mailbox = domain.mailboxes.find((m) => m.id === update.mailboxId);
            if (mailbox) {
              const folder = mailbox.folders.find((f) => f.id === update.folderId);
              if (folder) {
                const diff = update.count - folder.unreadCount;
                folder.unreadCount = update.count;
                mailbox.unreadCount += diff;
                domain.unreadCount += diff;
              }
            }
            // Check shared mailboxes
            const sharedMailbox = domain.sharedMailboxes.find((m) => m.id === update.mailboxId);
            if (sharedMailbox) {
              const folder = sharedMailbox.folders.find((f) => f.id === update.folderId);
              if (folder) {
                const diff = update.count - folder.unreadCount;
                folder.unreadCount = update.count;
                sharedMailbox.unreadCount += diff;
              }
            }
          }
        }),

      incrementUnreadCount: (domainId, mailboxId, folderId) =>
        set((state) => {
          const domain = state.domains.find((d) => d.id === domainId);
          if (domain) {
            const mailbox = domain.mailboxes.find((m) => m.id === mailboxId);
            if (mailbox) {
              const folder = mailbox.folders.find((f) => f.id === folderId);
              if (folder) {
                folder.unreadCount++;
                mailbox.unreadCount++;
                domain.unreadCount++;
              }
            }
          }
        }),

      decrementUnreadCount: (domainId, mailboxId, folderId) =>
        set((state) => {
          const domain = state.domains.find((d) => d.id === domainId);
          if (domain) {
            const mailbox = domain.mailboxes.find((m) => m.id === mailboxId);
            if (mailbox) {
              const folder = mailbox.folders.find((f) => f.id === folderId);
              if (folder && folder.unreadCount > 0) {
                folder.unreadCount--;
                mailbox.unreadCount--;
                domain.unreadCount--;
              }
            }
          }
        }),

      // Compose Actions
      setDefaultFromAddress: (address) =>
        set((state) => {
          state.defaultFromAddress = address;
        }),

      // Bulk Actions (these will trigger API calls in the component)
      markAsRead: (emailIds) =>
        set((state) => {
          emailIds.forEach((id) => {
            const email = state.emails.find((e) => e.id === id);
            if (email && !email.isRead) {
              email.isRead = true;
            }
          });
        }),

      markAsUnread: (emailIds) =>
        set((state) => {
          emailIds.forEach((id) => {
            const email = state.emails.find((e) => e.id === id);
            if (email?.isRead) {
              email.isRead = false;
            }
          });
        }),

      starEmails: (emailIds) =>
        set((state) => {
          emailIds.forEach((id) => {
            const email = state.emails.find((e) => e.id === id);
            if (email) {
              email.isStarred = true;
            }
          });
        }),

      unstarEmails: (emailIds) =>
        set((state) => {
          emailIds.forEach((id) => {
            const email = state.emails.find((e) => e.id === id);
            if (email) {
              email.isStarred = false;
            }
          });
        }),

      moveEmails: (emailIds, _destination) =>
        set((state) => {
          // Remove from current view after move
          const idsSet = new Set(emailIds);
          state.emails = state.emails.filter((e) => !idsSet.has(e.id));
          state.selectedEmails = new Set();
        }),

      deleteEmails: (emailIds) =>
        set((state) => {
          const idsSet = new Set(emailIds);
          state.emails = state.emails.filter((e) => !idsSet.has(e.id));
          state.selectedEmails = new Set();
        }),
    })),
    {
      name: "mail-store",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        viewPreferences: state.viewPreferences,
        expandedDomains: Array.from(state.expandedDomains),
        sidebarCollapsed: state.sidebarCollapsed,
        activeDomain: state.activeDomain,
      }),
      // Custom merge to handle Set serialization
      merge: (persisted, current) => {
        const persistedState = persisted as Partial<MailState>;
        return {
          ...current,
          viewPreferences: persistedState.viewPreferences ?? current.viewPreferences,
          expandedDomains: new Set((persistedState.expandedDomains as unknown as string[]) ?? []),
          sidebarCollapsed: persistedState.sidebarCollapsed ?? current.sidebarCollapsed,
          activeDomain: persistedState.activeDomain ?? current.activeDomain,
        };
      },
    }
  )
);

// ============================================================
// SELECTORS
// ============================================================

export const selectUnreadCount = (state: MailState): number => {
  if (state.activeDomain === "all") {
    return state.domains.reduce((sum, d) => sum + d.unreadCount, 0);
  }
  const domain = state.domains.find((d) => d.id === state.activeDomain);
  return domain?.unreadCount ?? 0;
};

export const selectActiveDomainData = (state: MailState): Domain | null => {
  if (state.activeDomain === "all") return null;
  return state.domains.find((d) => d.id === state.activeDomain) ?? null;
};

export const selectFolders = (state: MailState): MailFolder[] => {
  if (state.activeMailbox) {
    return state.activeMailbox.folders;
  }
  // Return combined folders for unified view
  const folderMap = new Map<string, MailFolder>();
  state.domains.forEach((domain) => {
    domain.mailboxes.forEach((mailbox) => {
      mailbox.folders.forEach((folder) => {
        if (folder.isSystem) {
          const existing = folderMap.get(folder.type);
          if (existing) {
            existing.unreadCount += folder.unreadCount;
            existing.totalCount += folder.totalCount;
          } else {
            folderMap.set(folder.type, { ...folder });
          }
        }
      });
    });
  });
  return Array.from(folderMap.values()).sort((a, b) => a.sortOrder - b.sortOrder);
};

export const selectSelectedEmailCount = (state: MailState): number => {
  return state.selectedEmails.size;
};

export const selectIsAllSelected = (state: MailState): boolean => {
  return state.emails.length > 0 && state.selectedEmails.size === state.emails.length;
};

export const selectHasSelection = (state: MailState): boolean => {
  return state.selectedEmails.size > 0;
};
