import React, { createContext, useContext, useReducer, useEffect } from "react";
import { useParams } from "react-router-dom";

export interface Mail {
  id: string;
  threadId: string;
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  isRead: boolean;
  isStarred: boolean;
  isImportant: boolean;
  isArchived: boolean;
  isSnoozed: boolean;
  snoozeUntil?: Date;
  folder: string;
  labels: string[];
  date: Date;
  attachments?: Attachment[];
  isDraft: boolean;
  isScheduled: boolean;
  scheduledAt?: Date;
  isSpam: boolean;
  isTrash: boolean;
}

export interface Thread {
  id: string;
  messages: Mail[];
  subject: string;
  participants: string[];
  lastMessageDate: Date;
  unreadCount: number;
  isStarred: boolean;
  isImportant: boolean;
  labels: string[];
  folder: string;
}

export interface Label {
  id: string;
  name: string;
  color: string;
  unreadCount: number;
  totalCount: number;
}

export interface Category {
  id: string;
  name: string;
  unreadCount: number;
  totalCount: number;
}

export interface Attachment {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
}

export interface FolderCounts {
  inbox: number;
  starred: number;
  snoozed: number;
  important: number;
  sent: number;
  drafts: number;
  scheduled: number;
  outbox: number;
  archive: number;
  spam: number;
  trash: number;
  all: number;
}

interface MailState {
  threads: Thread[];
  selectedThread: Thread | null;
  currentView: string;
  currentCategory?: string;
  currentLabel?: string;
  labels: Label[];
  categories: Category[];
  folderCounts: FolderCounts;
  searchQuery: string;
  loading: boolean;
  selectedThreads: string[];
}

type MailAction =
  | { type: "SET_THREADS"; payload: Thread[] }
  | { type: "SET_SELECTED_THREAD"; payload: Thread | null }
  | { type: "SET_CURRENT_VIEW"; payload: string }
  | { type: "SET_CURRENT_CATEGORY"; payload: string | undefined }
  | { type: "SET_CURRENT_LABEL"; payload: string | undefined }
  | { type: "SET_LABELS"; payload: Label[] }
  | { type: "SET_CATEGORIES"; payload: Category[] }
  | { type: "SET_FOLDER_COUNTS"; payload: FolderCounts }
  | { type: "SET_SEARCH_QUERY"; payload: string }
  | { type: "SET_LOADING"; payload: boolean }
  | { type: "SET_SELECTED_THREADS"; payload: string[] }
  | { type: "TOGGLE_THREAD_SELECTION"; payload: string }
  | { type: "ARCHIVE_THREADS"; payload: string[] }
  | { type: "DELETE_THREADS"; payload: string[] }
  | { type: "STAR_THREADS"; payload: { threadIds: string[]; starred: boolean } }
  | { type: "MARK_READ"; payload: { threadIds: string[]; read: boolean } };

const initialState: MailState = {
  threads: [],
  selectedThread: null,
  currentView: "inbox",
  currentCategory: undefined,
  currentLabel: undefined,
  labels: [
    {
      id: "work",
      name: "Work",
      color: "#3b82f6",
      unreadCount: 12,
      totalCount: 45,
    },
    {
      id: "personal",
      name: "Personal",
      color: "#10b981",
      unreadCount: 3,
      totalCount: 23,
    },
    {
      id: "bills",
      name: "Bills",
      color: "#f59e0b",
      unreadCount: 2,
      totalCount: 15,
    },
    {
      id: "travel",
      name: "Travel",
      color: "#8b5cf6",
      unreadCount: 0,
      totalCount: 8,
    },
  ],
  categories: [
    { id: "primary", name: "Primary", unreadCount: 15, totalCount: 234 },
    { id: "social", name: "Social", unreadCount: 8, totalCount: 156 },
    { id: "promotions", name: "Promotions", unreadCount: 23, totalCount: 789 },
    { id: "updates", name: "Updates", unreadCount: 5, totalCount: 345 },
    { id: "forums", name: "Forums", unreadCount: 2, totalCount: 67 },
  ],
  folderCounts: {
    inbox: 42,
    starred: 12,
    snoozed: 5,
    important: 8,
    sent: 0,
    drafts: 3,
    scheduled: 2,
    outbox: 0,
    archive: 0,
    spam: 15,
    trash: 7,
    all: 0,
  },
  searchQuery: "",
  loading: false,
  selectedThreads: [],
};

function mailReducer(state: MailState, action: MailAction): MailState {
  switch (action.type) {
    case "SET_THREADS":
      return { ...state, threads: action.payload };
    case "SET_SELECTED_THREAD":
      return { ...state, selectedThread: action.payload };
    case "SET_CURRENT_VIEW":
      return {
        ...state,
        currentView: action.payload,
        currentCategory: undefined,
        currentLabel: undefined,
      };
    case "SET_CURRENT_CATEGORY":
      return {
        ...state,
        currentCategory: action.payload,
        currentView: "",
        currentLabel: undefined,
      };
    case "SET_CURRENT_LABEL":
      return {
        ...state,
        currentLabel: action.payload,
        currentView: "",
        currentCategory: undefined,
      };
    case "SET_LABELS":
      return { ...state, labels: action.payload };
    case "SET_CATEGORIES":
      return { ...state, categories: action.payload };
    case "SET_FOLDER_COUNTS":
      return { ...state, folderCounts: action.payload };
    case "SET_SEARCH_QUERY":
      return { ...state, searchQuery: action.payload };
    case "SET_LOADING":
      return { ...state, loading: action.payload };
    case "SET_SELECTED_THREADS":
      return { ...state, selectedThreads: action.payload };
    case "TOGGLE_THREAD_SELECTION":
      const isSelected = state.selectedThreads.includes(action.payload);
      return {
        ...state,
        selectedThreads: isSelected
          ? state.selectedThreads.filter((id) => id !== action.payload)
          : [...state.selectedThreads, action.payload],
      };
    case "ARCHIVE_THREADS":
      return {
        ...state,
        threads: state.threads.filter(
          (thread) => !action.payload.includes(thread.id),
        ),
        selectedThreads: [],
        selectedThread:
          state.selectedThread &&
          action.payload.includes(state.selectedThread.id)
            ? null
            : state.selectedThread,
      };
    case "DELETE_THREADS":
      return {
        ...state,
        threads: state.threads.filter(
          (thread) => !action.payload.includes(thread.id),
        ),
        selectedThreads: [],
        selectedThread:
          state.selectedThread &&
          action.payload.includes(state.selectedThread.id)
            ? null
            : state.selectedThread,
      };
    case "STAR_THREADS":
      return {
        ...state,
        threads: state.threads.map((thread) =>
          action.payload.threadIds.includes(thread.id)
            ? { ...thread, isStarred: action.payload.starred }
            : thread,
        ),
        selectedThread:
          state.selectedThread &&
          action.payload.threadIds.includes(state.selectedThread.id)
            ? { ...state.selectedThread, isStarred: action.payload.starred }
            : state.selectedThread,
      };
    case "MARK_READ":
      return {
        ...state,
        threads: state.threads.map((thread) =>
          action.payload.threadIds.includes(thread.id)
            ? {
                ...thread,
                unreadCount: action.payload.read ? 0 : thread.unreadCount,
              }
            : thread,
        ),
      };
    default:
      return state;
  }
}

interface MailContextType extends MailState {
  dispatch: React.Dispatch<MailAction>;
  selectThread: (threadId: string | null) => void;
  toggleThreadSelection: (threadId: string) => void;
  archiveThreads: (threadIds: string[]) => void;
  deleteThreads: (threadIds: string[]) => void;
  starThreads: (threadIds: string[], starred: boolean) => void;
  markAsRead: (threadIds: string[], read: boolean) => void;
  createLabel: (name: string, color: string) => void;
  deleteLabel: (labelId: string) => void;
}

const MailContext = createContext<MailContextType | null>(null);

export function MailProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(mailReducer, initialState);
  const params = useParams();

  // Sync URL params with state
  useEffect(() => {
    if (params.view) {
      dispatch({ type: "SET_CURRENT_VIEW", payload: params.view });
    } else if (params.categoryId) {
      dispatch({ type: "SET_CURRENT_CATEGORY", payload: params.categoryId });
    } else if (params.labelId) {
      dispatch({ type: "SET_CURRENT_LABEL", payload: params.labelId });
    }
  }, [params]);

  // Load mock data
  useEffect(() => {
    // Simulate loading threads
    setTimeout(() => {
      const mockThreads: Thread[] = [
        {
          id: "1",
          subject: "Welcome to CEERION Mail",
          participants: ["support@ceerion.com"],
          lastMessageDate: new Date(),
          unreadCount: 1,
          isStarred: false,
          isImportant: true,
          labels: ["work"],
          folder: "inbox",
          messages: [
            {
              id: "1",
              threadId: "1",
              from: "support@ceerion.com",
              to: ["user@ceerion.com"],
              subject: "Welcome to CEERION Mail",
              body: "Welcome to your new CEERION Mail account!",
              isRead: false,
              isStarred: false,
              isImportant: true,
              isArchived: false,
              isSnoozed: false,
              folder: "inbox",
              labels: ["work"],
              date: new Date(),
              isDraft: false,
              isScheduled: false,
              isSpam: false,
              isTrash: false,
            },
          ],
        },
        // Add more mock threads...
      ];
      dispatch({ type: "SET_THREADS", payload: mockThreads });
    }, 500);
  }, [state.currentView, state.currentCategory, state.currentLabel]);

  const selectThread = (threadId: string | null) => {
    if (threadId) {
      const thread = state.threads.find((t) => t.id === threadId);
      dispatch({ type: "SET_SELECTED_THREAD", payload: thread || null });
    } else {
      dispatch({ type: "SET_SELECTED_THREAD", payload: null });
    }
  };

  const toggleThreadSelection = (threadId: string) => {
    dispatch({ type: "TOGGLE_THREAD_SELECTION", payload: threadId });
  };

  const archiveThreads = (threadIds: string[]) => {
    dispatch({ type: "ARCHIVE_THREADS", payload: threadIds });
    // Update folder counts
    const newCounts = { ...state.folderCounts };
    newCounts[state.currentView as keyof FolderCounts] -= threadIds.length;
    dispatch({ type: "SET_FOLDER_COUNTS", payload: newCounts });
  };

  const deleteThreads = (threadIds: string[]) => {
    dispatch({ type: "DELETE_THREADS", payload: threadIds });
    // Update folder counts
    const newCounts = { ...state.folderCounts };
    newCounts[state.currentView as keyof FolderCounts] -= threadIds.length;
    dispatch({ type: "SET_FOLDER_COUNTS", payload: newCounts });
  };

  const starThreads = (threadIds: string[], starred: boolean) => {
    dispatch({ type: "STAR_THREADS", payload: { threadIds, starred } });
  };

  const markAsRead = (threadIds: string[], read: boolean) => {
    dispatch({ type: "MARK_READ", payload: { threadIds, read } });
  };

  const createLabel = (name: string, color: string) => {
    const newLabel: Label = {
      id: name.toLowerCase().replace(/\s+/g, "-"),
      name,
      color,
      unreadCount: 0,
      totalCount: 0,
    };
    dispatch({ type: "SET_LABELS", payload: [...state.labels, newLabel] });
  };

  const deleteLabel = (labelId: string) => {
    dispatch({
      type: "SET_LABELS",
      payload: state.labels.filter((l) => l.id !== labelId),
    });
  };

  const contextValue: MailContextType = {
    ...state,
    dispatch,
    selectThread,
    toggleThreadSelection,
    archiveThreads,
    deleteThreads,
    starThreads,
    markAsRead,
    createLabel,
    deleteLabel,
  };

  return (
    <MailContext.Provider value={contextValue}>{children}</MailContext.Provider>
  );
}

export function useMail() {
  const context = useContext(MailContext);
  if (!context) {
    throw new Error("useMail must be used within a MailProvider");
  }
  return context;
}
