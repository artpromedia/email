/**
 * CSP Nonce Provider and Hook
 *
 * Provides the CSP nonce to React components for inline scripts/styles.
 * The nonce is passed from middleware via the X-Nonce header.
 */

"use client";

import { createContext, useContext, type ReactNode, useMemo } from "react";
import { headers } from "next/headers";

interface NonceContextValue {
  nonce: string | undefined;
}

const NonceContext = createContext<NonceContextValue>({ nonce: undefined });

/**
 * Get nonce from request headers (server-side only)
 */
export async function getServerNonce(): Promise<string | undefined> {
  try {
    const headersList = await headers();
    return headersList.get("x-nonce") || undefined;
  } catch {
    // headers() only works in Server Components
    return undefined;
  }
}

/**
 * Provider for CSP nonce in client components
 */
export function NonceProvider({
  children,
  nonce,
}: Readonly<{
  children: ReactNode;
  nonce: string | undefined;
}>) {
  const value = useMemo(() => ({ nonce }), [nonce]);
  return <NonceContext.Provider value={value}>{children}</NonceContext.Provider>;
}

/**
 * Hook to access the CSP nonce in client components
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { nonce } = useNonce();
 *   return (
 *     <script nonce={nonce}>
 *       console.log('Inline script with nonce');
 *     </script>
 *   );
 * }
 * ```
 */
export function useNonce(): NonceContextValue {
  return useContext(NonceContext);
}

/**
 * Script component with automatic nonce injection
 */
export function NonceScript({
  children,
  ...props
}: React.ScriptHTMLAttributes<HTMLScriptElement> & { children?: string }) {
  const { nonce } = useNonce();

  return (
    <script nonce={nonce} {...props}>
      {children}
    </script>
  );
}

/**
 * Style component with automatic nonce injection
 */
export function NonceStyle({
  children,
  ...props
}: React.StyleHTMLAttributes<HTMLStyleElement> & { children?: string }) {
  const { nonce } = useNonce();

  return (
    <style nonce={nonce} {...props}>
      {children}
    </style>
  );
}
