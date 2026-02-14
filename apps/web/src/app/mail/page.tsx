"use client";

/**
 * Mail Root Page
 * Redirects to the inbox - handles /mail URL from keyboard shortcuts
 */

import { useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

function MailRedirectContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const folder = searchParams.get("folder");
    if (folder) {
      router.replace(`/mail/inbox?folder=${folder}`);
    } else {
      router.replace("/mail/inbox");
    }
  }, [router, searchParams]);

  return (
    <div className="flex h-full items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
    </div>
  );
}

export default function MailRootPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
        </div>
      }
    >
      <MailRedirectContent />
    </Suspense>
  );
}
