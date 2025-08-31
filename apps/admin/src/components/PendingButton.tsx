import React from "react";
import { Button, ButtonProps } from "./ui/button";
import { Loader2 } from "lucide-react";

interface PendingButtonProps extends ButtonProps {
  pending?: boolean;
  pendingText?: string;
}

export const PendingButton = React.forwardRef<
  HTMLButtonElement,
  PendingButtonProps
>(({ pending = false, pendingText, children, disabled, ...props }, ref) => {
  return (
    <Button ref={ref} disabled={disabled || pending} {...props}>
      {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
      {pending ? pendingText || children : children}
    </Button>
  );
});

PendingButton.displayName = "PendingButton";
