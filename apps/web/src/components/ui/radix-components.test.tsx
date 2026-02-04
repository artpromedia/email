/**
 * Additional UI Components Tests
 * Tests for Checkbox, Dialog, Tabs, and other Radix-based UI components
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Checkbox } from "./checkbox";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "./dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./tabs";

describe("Checkbox", () => {
  describe("rendering", () => {
    it("renders checkbox", () => {
      render(<Checkbox aria-label="Accept terms" />);

      expect(screen.getByRole("checkbox")).toBeInTheDocument();
    });

    it("forwards ref", () => {
      const ref = React.createRef<HTMLButtonElement>();
      render(<Checkbox ref={ref} />);

      expect(ref.current).toBeInstanceOf(HTMLButtonElement);
    });
  });

  describe("states", () => {
    it("is unchecked by default", () => {
      render(<Checkbox aria-label="Option" />);

      expect(screen.getByRole("checkbox")).not.toBeChecked();
    });

    it("can be checked by default", () => {
      render(<Checkbox aria-label="Option" defaultChecked />);

      expect(screen.getByRole("checkbox")).toBeChecked();
    });

    it("can be controlled", () => {
      const { rerender } = render(
        <Checkbox aria-label="Option" checked={false} onCheckedChange={() => {}} />
      );

      expect(screen.getByRole("checkbox")).not.toBeChecked();

      rerender(<Checkbox aria-label="Option" checked onCheckedChange={() => {}} />);

      expect(screen.getByRole("checkbox")).toBeChecked();
    });

    it("can be disabled", () => {
      render(<Checkbox aria-label="Option" disabled />);

      expect(screen.getByRole("checkbox")).toBeDisabled();
    });
  });

  describe("interactions", () => {
    it("toggles when clicked", async () => {
      render(<Checkbox aria-label="Option" />);

      const checkbox = screen.getByRole("checkbox");
      expect(checkbox).not.toBeChecked();

      await userEvent.click(checkbox);

      expect(checkbox).toBeChecked();
    });

    it("calls onCheckedChange when clicked", async () => {
      const handleChange = jest.fn();
      render(<Checkbox aria-label="Option" onCheckedChange={handleChange} />);

      await userEvent.click(screen.getByRole("checkbox"));

      expect(handleChange).toHaveBeenCalledWith(true);
    });

    it("does not toggle when disabled", async () => {
      render(<Checkbox aria-label="Option" disabled />);

      const checkbox = screen.getByRole("checkbox");
      await userEvent.click(checkbox);

      expect(checkbox).not.toBeChecked();
    });

    it("can be toggled via keyboard", async () => {
      render(<Checkbox aria-label="Option" />);

      const checkbox = screen.getByRole("checkbox");
      checkbox.focus();
      await userEvent.keyboard(" ");

      expect(checkbox).toBeChecked();
    });
  });

  describe("styling", () => {
    it("applies default styles", () => {
      render(<Checkbox data-testid="cb" />);

      const checkbox = screen.getByTestId("cb");
      expect(checkbox).toHaveClass("h-4", "w-4", "rounded-sm", "border");
    });

    it("merges custom className", () => {
      render(<Checkbox data-testid="cb" className="custom-class" />);

      const checkbox = screen.getByTestId("cb");
      expect(checkbox).toHaveClass("custom-class");
    });
  });
});

describe("Dialog", () => {
  describe("rendering", () => {
    it("does not show content initially", () => {
      render(
        <Dialog>
          <DialogTrigger>Open</DialogTrigger>
          <DialogContent>
            <DialogTitle>Dialog Title</DialogTitle>
          </DialogContent>
        </Dialog>
      );

      expect(screen.queryByText("Dialog Title")).not.toBeInTheDocument();
    });

    it("shows content when open", () => {
      render(
        <Dialog open>
          <DialogContent>
            <DialogTitle>Dialog Title</DialogTitle>
          </DialogContent>
        </Dialog>
      );

      expect(screen.getByText("Dialog Title")).toBeInTheDocument();
    });
  });

  describe("interactions", () => {
    it("opens when trigger is clicked", async () => {
      render(
        <Dialog>
          <DialogTrigger>Open Dialog</DialogTrigger>
          <DialogContent>
            <DialogTitle>Dialog Title</DialogTitle>
            <DialogDescription>Dialog content here</DialogDescription>
          </DialogContent>
        </Dialog>
      );

      expect(screen.queryByText("Dialog Title")).not.toBeInTheDocument();

      await userEvent.click(screen.getByText("Open Dialog"));

      await waitFor(() => {
        expect(screen.getByText("Dialog Title")).toBeInTheDocument();
      });
    });

    it("closes when close button is clicked", async () => {
      render(
        <Dialog defaultOpen>
          <DialogContent>
            <DialogTitle>Dialog Title</DialogTitle>
          </DialogContent>
        </Dialog>
      );

      expect(screen.getByText("Dialog Title")).toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "Close" }));

      await waitFor(() => {
        expect(screen.queryByText("Dialog Title")).not.toBeInTheDocument();
      });
    });

    it("closes when Escape key is pressed", async () => {
      render(
        <Dialog defaultOpen>
          <DialogContent>
            <DialogTitle>Dialog Title</DialogTitle>
          </DialogContent>
        </Dialog>
      );

      expect(screen.getByText("Dialog Title")).toBeInTheDocument();

      await userEvent.keyboard("{Escape}");

      await waitFor(() => {
        expect(screen.queryByText("Dialog Title")).not.toBeInTheDocument();
      });
    });

    it("calls onOpenChange when state changes", async () => {
      const handleOpenChange = jest.fn();
      render(
        <Dialog onOpenChange={handleOpenChange}>
          <DialogTrigger>Open</DialogTrigger>
          <DialogContent>
            <DialogTitle>Title</DialogTitle>
          </DialogContent>
        </Dialog>
      );

      await userEvent.click(screen.getByText("Open"));

      expect(handleOpenChange).toHaveBeenCalledWith(true);
    });
  });

  describe("DialogHeader", () => {
    it("renders header content", () => {
      render(
        <Dialog open>
          <DialogContent>
            <DialogHeader data-testid="header">
              <DialogTitle>Title</DialogTitle>
              <DialogDescription>Description</DialogDescription>
            </DialogHeader>
          </DialogContent>
        </Dialog>
      );

      expect(screen.getByTestId("header")).toBeInTheDocument();
      expect(screen.getByText("Title")).toBeInTheDocument();
      expect(screen.getByText("Description")).toBeInTheDocument();
    });
  });

  describe("DialogFooter", () => {
    it("renders footer content", () => {
      render(
        <Dialog open>
          <DialogContent>
            <DialogTitle>Title</DialogTitle>
            <DialogFooter data-testid="footer">
              <button>Cancel</button>
              <button>Submit</button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      );

      expect(screen.getByTestId("footer")).toBeInTheDocument();
      expect(screen.getByText("Cancel")).toBeInTheDocument();
      expect(screen.getByText("Submit")).toBeInTheDocument();
    });
  });

  describe("DialogClose", () => {
    it("closes dialog when clicked", async () => {
      render(
        <Dialog defaultOpen>
          <DialogContent>
            <DialogTitle>Title</DialogTitle>
            <DialogClose>Close Me</DialogClose>
          </DialogContent>
        </Dialog>
      );

      await userEvent.click(screen.getByText("Close Me"));

      await waitFor(() => {
        expect(screen.queryByText("Title")).not.toBeInTheDocument();
      });
    });
  });
});

describe("Tabs", () => {
  describe("rendering", () => {
    it("renders tabs with content", () => {
      render(
        <Tabs defaultValue="tab1">
          <TabsList>
            <TabsTrigger value="tab1">Tab 1</TabsTrigger>
            <TabsTrigger value="tab2">Tab 2</TabsTrigger>
          </TabsList>
          <TabsContent value="tab1">Content 1</TabsContent>
          <TabsContent value="tab2">Content 2</TabsContent>
        </Tabs>
      );

      expect(screen.getByRole("tablist")).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: "Tab 1" })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: "Tab 2" })).toBeInTheDocument();
    });

    it("shows default tab content", () => {
      render(
        <Tabs defaultValue="tab1">
          <TabsList>
            <TabsTrigger value="tab1">Tab 1</TabsTrigger>
            <TabsTrigger value="tab2">Tab 2</TabsTrigger>
          </TabsList>
          <TabsContent value="tab1">Content 1</TabsContent>
          <TabsContent value="tab2">Content 2</TabsContent>
        </Tabs>
      );

      expect(screen.getByText("Content 1")).toBeInTheDocument();
      // Inactive tab content is hidden from accessibility tree
      expect(screen.queryByText("Content 2")).not.toBeInTheDocument();
    });
  });

  describe("interactions", () => {
    it("switches content when tab is clicked", async () => {
      render(
        <Tabs defaultValue="tab1">
          <TabsList>
            <TabsTrigger value="tab1">Tab 1</TabsTrigger>
            <TabsTrigger value="tab2">Tab 2</TabsTrigger>
          </TabsList>
          <TabsContent value="tab1">Content 1</TabsContent>
          <TabsContent value="tab2">Content 2</TabsContent>
        </Tabs>
      );

      await userEvent.click(screen.getByRole("tab", { name: "Tab 2" }));

      expect(screen.getByText("Content 2")).toBeInTheDocument();
    });

    it("calls onValueChange when tab changes", async () => {
      const handleValueChange = jest.fn();
      render(
        <Tabs defaultValue="tab1" onValueChange={handleValueChange}>
          <TabsList>
            <TabsTrigger value="tab1">Tab 1</TabsTrigger>
            <TabsTrigger value="tab2">Tab 2</TabsTrigger>
          </TabsList>
          <TabsContent value="tab1">Content 1</TabsContent>
          <TabsContent value="tab2">Content 2</TabsContent>
        </Tabs>
      );

      await userEvent.click(screen.getByRole("tab", { name: "Tab 2" }));

      expect(handleValueChange).toHaveBeenCalledWith("tab2");
    });

    it("navigates tabs with keyboard", async () => {
      render(
        <Tabs defaultValue="tab1">
          <TabsList>
            <TabsTrigger value="tab1">Tab 1</TabsTrigger>
            <TabsTrigger value="tab2">Tab 2</TabsTrigger>
            <TabsTrigger value="tab3">Tab 3</TabsTrigger>
          </TabsList>
          <TabsContent value="tab1">Content 1</TabsContent>
          <TabsContent value="tab2">Content 2</TabsContent>
          <TabsContent value="tab3">Content 3</TabsContent>
        </Tabs>
      );

      // Click to focus the first tab
      await userEvent.click(screen.getByRole("tab", { name: "Tab 1" }));

      // Navigate with arrow key
      await userEvent.keyboard("{ArrowRight}");

      // Second tab should receive focus
      expect(screen.getByRole("tab", { name: "Tab 2" })).toHaveFocus();
    });
  });

  describe("disabled state", () => {
    it("cannot activate disabled tab", async () => {
      render(
        <Tabs defaultValue="tab1">
          <TabsList>
            <TabsTrigger value="tab1">Tab 1</TabsTrigger>
            <TabsTrigger value="tab2" disabled>
              Tab 2
            </TabsTrigger>
          </TabsList>
          <TabsContent value="tab1">Content 1</TabsContent>
          <TabsContent value="tab2">Content 2</TabsContent>
        </Tabs>
      );

      const disabledTab = screen.getByRole("tab", { name: "Tab 2" });
      await userEvent.click(disabledTab);

      expect(screen.getByText("Content 1")).toBeInTheDocument();
      // Inactive tab content is hidden from accessibility tree
      expect(screen.queryByText("Content 2")).not.toBeInTheDocument();
    });
  });

  describe("controlled mode", () => {
    it("can be controlled externally", () => {
      const { rerender } = render(
        <Tabs value="tab1">
          <TabsList>
            <TabsTrigger value="tab1">Tab 1</TabsTrigger>
            <TabsTrigger value="tab2">Tab 2</TabsTrigger>
          </TabsList>
          <TabsContent value="tab1">Content 1</TabsContent>
          <TabsContent value="tab2">Content 2</TabsContent>
        </Tabs>
      );

      expect(screen.getByText("Content 1")).toBeInTheDocument();

      rerender(
        <Tabs value="tab2">
          <TabsList>
            <TabsTrigger value="tab1">Tab 1</TabsTrigger>
            <TabsTrigger value="tab2">Tab 2</TabsTrigger>
          </TabsList>
          <TabsContent value="tab1">Content 1</TabsContent>
          <TabsContent value="tab2">Content 2</TabsContent>
        </Tabs>
      );

      expect(screen.getByText("Content 2")).toBeInTheDocument();
    });
  });

  describe("styling", () => {
    it("applies default styles to TabsList", () => {
      render(
        <Tabs defaultValue="tab1">
          <TabsList data-testid="list">
            <TabsTrigger value="tab1">Tab 1</TabsTrigger>
          </TabsList>
          <TabsContent value="tab1">Content</TabsContent>
        </Tabs>
      );

      const list = screen.getByTestId("list");
      expect(list).toHaveClass("inline-flex", "rounded-lg", "bg-muted");
    });

    it("applies default styles to TabsTrigger", () => {
      render(
        <Tabs defaultValue="tab1">
          <TabsList>
            <TabsTrigger value="tab1" data-testid="trigger">
              Tab 1
            </TabsTrigger>
          </TabsList>
          <TabsContent value="tab1">Content</TabsContent>
        </Tabs>
      );

      const trigger = screen.getByTestId("trigger");
      expect(trigger).toHaveClass("inline-flex", "rounded-md", "text-sm");
    });

    it("merges custom className", () => {
      render(
        <Tabs defaultValue="tab1">
          <TabsList className="custom-list">
            <TabsTrigger value="tab1" className="custom-trigger">
              Tab 1
            </TabsTrigger>
          </TabsList>
          <TabsContent value="tab1" className="custom-content">
            Content
          </TabsContent>
        </Tabs>
      );

      expect(screen.getByRole("tablist")).toHaveClass("custom-list");
      expect(screen.getByRole("tab")).toHaveClass("custom-trigger");
    });
  });
});
