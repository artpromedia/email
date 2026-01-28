import { Loader2 } from "lucide-react";

import { cn } from "../lib/utils";

interface SpinnerProps {
  readonly className?: string;
  readonly size?: "sm" | "md" | "lg";
}

const sizeClasses = {
  sm: "h-4 w-4",
  md: "h-6 w-6",
  lg: "h-8 w-8",
};

export function Spinner({ className, size = "md" }: SpinnerProps) {
  return <Loader2 className={cn("animate-spin", sizeClasses[size], className)} />;
}

interface LoadingProps {
  readonly className?: string;
  readonly text?: string;
}

export function Loading({ className, text = "Loading..." }: LoadingProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2", className)}>
      <Spinner size="lg" />
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
