import React from "react";
import { Button, ButtonProps } from "./button";
import { Loader2 } from "lucide-react";
import { cn } from "../../lib/utils";

interface PendingButtonProps extends ButtonProps {
  /** Whether the button is in pending/loading state */
  isPending?: boolean;
  /** Text to show when pending (optional) */
  pendingText?: string;
  /** Custom loading icon (optional) */
  loadingIcon?: React.ReactNode;
}

/**
 * A button component that shows loading state during mutations
 * Prevents double-clicks and provides visual feedback
 */
export function PendingButton({
  isPending = false,
  pendingText,
  loadingIcon,
  children,
  disabled,
  className,
  ...props
}: PendingButtonProps) {
  const isDisabled = disabled || isPending;

  return (
    <Button
      {...props}
      disabled={isDisabled}
      className={cn(
        // Add subtle opacity when pending
        isPending && "opacity-80",
        className,
      )}
    >
      {isPending && (
        <span className="mr-2 flex items-center">
          {loadingIcon || <Loader2 className="h-4 w-4 animate-spin" />}
        </span>
      )}
      {isPending && pendingText ? pendingText : children}
    </Button>
  );
}
