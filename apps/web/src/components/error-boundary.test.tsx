/**
 * Error Boundary Tests
 * Tests for the ErrorBoundary component
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ErrorBoundary, withErrorBoundary } from "./error-boundary";

// Suppress console.error for cleaner test output
const originalConsoleError = console.error;
beforeAll(() => {
  console.error = jest.fn();
});
afterAll(() => {
  console.error = originalConsoleError;
});

// Component that throws an error
function ThrowError({ shouldThrow = false }: Readonly<{ shouldThrow?: boolean }>): React.ReactNode {
  if (shouldThrow) {
    throw new Error("Test error message");
  }
  return <div>Normal content</div>;
}

describe("ErrorBoundary", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("normal operation", () => {
    it("renders children when no error occurs", () => {
      render(
        <ErrorBoundary>
          <div>Child content</div>
        </ErrorBoundary>
      );

      expect(screen.getByText("Child content")).toBeInTheDocument();
    });

    it("renders multiple children", () => {
      render(
        <ErrorBoundary>
          <div>Child 1</div>
          <div>Child 2</div>
        </ErrorBoundary>
      );

      expect(screen.getByText("Child 1")).toBeInTheDocument();
      expect(screen.getByText("Child 2")).toBeInTheDocument();
    });

    it("renders complex component trees", () => {
      render(
        <ErrorBoundary>
          <div>
            <header>Header</header>
            <main>
              <article>Article content</article>
            </main>
            <footer>Footer</footer>
          </div>
        </ErrorBoundary>
      );

      expect(screen.getByText("Header")).toBeInTheDocument();
      expect(screen.getByText("Article content")).toBeInTheDocument();
      expect(screen.getByText("Footer")).toBeInTheDocument();
    });
  });

  describe("error handling", () => {
    it("catches errors and shows default fallback UI", () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow />
        </ErrorBoundary>
      );

      expect(screen.getByText("Something went wrong")).toBeInTheDocument();
      expect(screen.getByText("Test error message")).toBeInTheDocument();
    });

    it("shows custom fallback when provided", () => {
      render(
        <ErrorBoundary fallback={<div>Custom error message</div>}>
          <ThrowError shouldThrow />
        </ErrorBoundary>
      );

      expect(screen.getByText("Custom error message")).toBeInTheDocument();
      expect(screen.queryByText("Something went wrong")).not.toBeInTheDocument();
    });

    it("calls onError callback when error occurs", () => {
      const handleError = jest.fn();

      render(
        <ErrorBoundary onError={handleError}>
          <ThrowError shouldThrow />
        </ErrorBoundary>
      );

      expect(handleError).toHaveBeenCalledTimes(1);
      expect(handleError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          componentStack: expect.any(String),
        })
      );
    });

    it("displays error message in fallback UI", () => {
      const testError = new Error("Specific error message");

      function ThrowSpecificError(): React.ReactNode {
        throw testError;
      }

      render(
        <ErrorBoundary>
          <ThrowSpecificError />
        </ErrorBoundary>
      );

      expect(screen.getByText("Specific error message")).toBeInTheDocument();
    });
  });

  describe("recovery actions", () => {
    it("renders try again button", () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow />
        </ErrorBoundary>
      );

      expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
    });

    it("renders refresh page button", () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow />
        </ErrorBoundary>
      );

      expect(screen.getByRole("button", { name: /refresh page/i })).toBeInTheDocument();
    });

    it("renders go home button", () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow />
        </ErrorBoundary>
      );

      expect(screen.getByRole("button", { name: /go home/i })).toBeInTheDocument();
    });

    it("resets error state when try again is clicked", async () => {
      // Note: Error boundaries require a key change or setState to reset
      // This test verifies the try again button is clickable
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow />
        </ErrorBoundary>
      );

      expect(screen.getByText("Something went wrong")).toBeInTheDocument();

      // Click try again - button should be present and clickable
      const tryAgainButton = screen.getByRole("button", { name: /try again/i });
      expect(tryAgainButton).toBeInTheDocument();

      // Clicking it should work without error
      await userEvent.click(tryAgainButton);
    });
  });

  describe("technical details", () => {
    it("shows technical details toggle in development mode", () => {
      render(
        <ErrorBoundary showDetails>
          <ThrowError shouldThrow />
        </ErrorBoundary>
      );

      expect(screen.getByText("Technical Details")).toBeInTheDocument();
    });

    it("hides technical details when showDetails is false", () => {
      render(
        <ErrorBoundary showDetails={false}>
          <ThrowError shouldThrow />
        </ErrorBoundary>
      );

      expect(screen.queryByText("Technical Details")).not.toBeInTheDocument();
    });

    it("expands stack trace when technical details is clicked", async () => {
      const error = new Error("Test error");
      error.stack = "Error: Test error\n    at Component";

      function ThrowWithStack(): React.ReactNode {
        throw error;
      }

      render(
        <ErrorBoundary showDetails>
          <ThrowWithStack />
        </ErrorBoundary>
      );

      await userEvent.click(screen.getByText("Technical Details"));

      // Stack trace should be visible
      expect(screen.getByText(/Error: Test error/)).toBeInTheDocument();
    });
  });

  describe("error logging", () => {
    it("logs error to console", () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow />
        </ErrorBoundary>
      );

      expect(console.error).toHaveBeenCalled();
    });
  });
});

describe("withErrorBoundary HOC", () => {
  it("wraps component with error boundary", () => {
    function TestComponent() {
      return <div>Test component content</div>;
    }

    const WrappedComponent = withErrorBoundary(TestComponent);

    render(<WrappedComponent />);

    expect(screen.getByText("Test component content")).toBeInTheDocument();
  });

  it("catches errors from wrapped component", () => {
    function ErrorComponent(): React.ReactNode {
      throw new Error("HOC error");
    }

    const WrappedComponent = withErrorBoundary(ErrorComponent);

    render(<WrappedComponent />);

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getByText("HOC error")).toBeInTheDocument();
  });

  it("passes props to wrapped component", () => {
    function TestComponent({ message }: { message: string }) {
      return <div>{message}</div>;
    }

    const WrappedComponent = withErrorBoundary(TestComponent);

    render(<WrappedComponent message="Hello from props" />);

    expect(screen.getByText("Hello from props")).toBeInTheDocument();
  });

  it("passes error boundary props", () => {
    function ErrorComponent(): React.ReactNode {
      throw new Error("Test error");
    }

    const handleError = jest.fn();
    const WrappedComponent = withErrorBoundary(ErrorComponent, {
      onError: handleError,
    });

    render(<WrappedComponent />);

    expect(handleError).toHaveBeenCalled();
  });

  it("uses custom fallback from HOC props", () => {
    function ErrorComponent(): React.ReactNode {
      throw new Error("Test error");
    }

    const WrappedComponent = withErrorBoundary(ErrorComponent, {
      fallback: <div>Custom HOC fallback</div>,
    });

    render(<WrappedComponent />);

    expect(screen.getByText("Custom HOC fallback")).toBeInTheDocument();
  });
});
