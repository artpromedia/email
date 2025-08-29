import * as React from "react";
import { cn } from "@/lib/utils";

interface CollapsibleProps {
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}

interface CollapsibleTriggerProps {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}

interface CollapsibleContentProps {
  children: React.ReactNode;
  className?: string;
}

const CollapsibleContext = React.createContext<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
} | null>(null);

const Collapsible = React.forwardRef<HTMLDivElement, CollapsibleProps>(
  ({ children, open = false, onOpenChange, className, ...props }, ref) => {
    const [internalOpen, setInternalOpen] = React.useState(open);

    const isOpen = open !== undefined ? open : internalOpen;
    const setOpen = onOpenChange || setInternalOpen;

    return (
      <CollapsibleContext.Provider
        value={{ open: isOpen, onOpenChange: setOpen }}
      >
        <div ref={ref} className={className} {...props}>
          {children}
        </div>
      </CollapsibleContext.Provider>
    );
  },
);
Collapsible.displayName = "Collapsible";

const CollapsibleTrigger = React.forwardRef<
  HTMLButtonElement,
  CollapsibleTriggerProps
>(({ children, onClick, className, ...props }, ref) => {
  const context = React.useContext(CollapsibleContext);

  const handleClick = () => {
    if (context) {
      context.onOpenChange(!context.open);
    }
    onClick?.();
  };

  return (
    <button
      ref={ref}
      onClick={handleClick}
      className={cn("outline-none", className)}
      {...props}
    >
      {children}
    </button>
  );
});
CollapsibleTrigger.displayName = "CollapsibleTrigger";

const CollapsibleContent = React.forwardRef<
  HTMLDivElement,
  CollapsibleContentProps
>(({ children, className, ...props }, ref) => {
  const context = React.useContext(CollapsibleContext);

  if (!context?.open) {
    return null;
  }

  return (
    <div ref={ref} className={className} {...props}>
      {children}
    </div>
  );
});
CollapsibleContent.displayName = "CollapsibleContent";

export { Collapsible, CollapsibleTrigger, CollapsibleContent };
