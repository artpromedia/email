"use client";

/**
 * Auth Layout - Wraps all authentication pages with domain branding
 */

import { DomainBrandingProvider } from "@email/ui";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <DomainBrandingProvider>
      <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-background to-muted/30 p-4">
        <div className="w-full max-w-md">{children}</div>
        <footer className="mt-8 text-center text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} OonruMail. All rights reserved.</p>
        </footer>
      </div>
    </DomainBrandingProvider>
  );
}
