"use client";

/**
 * Compose Page
 * Full-page email compose view accessible from /mail/compose
 */

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

import { EmailCompose } from "@/components/mail/compose";
import type { ComposeContext } from "@/lib/mail";

// ============================================================
// COMPOSE PAGE CONTENT
// ============================================================

function ComposeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Build compose context from URL params (for reply/forward)
  const context: ComposeContext | undefined = (() => {
    const mode = searchParams.get("mode") as "reply" | "reply-all" | "forward" | null;
    const to = searchParams.get("to");
    const subject = searchParams.get("subject");

    if (mode) {
      return { mode };
    }

    if (to || subject) {
      return {
        mode: "new" as const,
        ...(to ? { prefillTo: to.split(",").map((addr) => addr.trim()) } : {}),
        ...(subject ? { prefillSubject: subject } : {}),
      };
    }

    return undefined;
  })();

  const handleClose = () => {
    // Navigate back to inbox
    router.push("/mail/inbox");
  };

  return (
    <div className="flex h-full flex-col bg-neutral-50 dark:bg-neutral-950">
      <EmailCompose context={context} onClose={handleClose} className="flex-1" />
    </div>
  );
}

// ============================================================
// LOADING FALLBACK
// ============================================================

function ComposeLoading() {
  return (
    <div className="flex h-full items-center justify-center bg-neutral-50 dark:bg-neutral-950">
      <div className="flex items-center gap-3 text-neutral-500 dark:text-neutral-400">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Loading compose...</span>
      </div>
    </div>
  );
}

// ============================================================
// MAIN PAGE EXPORT
// ============================================================

export default function ComposePage() {
  return (
    <Suspense fallback={<ComposeLoading />}>
      <ComposeContent />
    </Suspense>
  );
}
