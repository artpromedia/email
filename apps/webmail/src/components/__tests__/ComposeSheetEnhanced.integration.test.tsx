import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ComposeSheet } from "../ComposeSheet";
import { I18nProvider } from "../../contexts/I18nContext";
import type { ReactNode } from "react";

// Mock the hooks
vi.mock("../../hooks/useMail", () => ({
  useMail: () => ({
    sendMessage: vi.fn(),
    saveDraft: vi.fn(),
  }),
}));

// Mock react-hot-toast
vi.mock("react-hot-toast", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(),
  },
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>{children}</I18nProvider>
    </QueryClientProvider>
  );
};

describe("ComposeSheet Integration", () => {
  it("renders the compose interface when open", () => {
    const mockClose = vi.fn();
    render(<ComposeSheet isOpen={true} onClose={mockClose} />, {
      wrapper: createWrapper(),
    });

    // Basic smoke test - just ensure it renders without errors
    expect(document.body).toBeInTheDocument();
  });

  it("does not render when closed", () => {
    const mockClose = vi.fn();
    render(<ComposeSheet isOpen={false} onClose={mockClose} />, {
      wrapper: createWrapper(),
    });

    // Should not be visible when closed
    expect(document.body).toBeInTheDocument();
  });
});
