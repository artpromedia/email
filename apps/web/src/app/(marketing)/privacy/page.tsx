/**
 * Privacy Policy Page
 * Privacy policy for OonruMail platform
 */

import Link from "next/link";
import { type Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — OonruMail",
  description: "Privacy Policy for the OonruMail email platform.",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 border-b border-white/10 bg-gray-950/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-cyan-400 font-bold text-white">
              M
            </div>
            <span className="text-xl font-bold">OonruMail</span>
          </Link>
          <div className="flex items-center gap-6 text-sm text-gray-400">
            <Link href="/pricing" className="transition-colors hover:text-white">
              Pricing
            </Link>
            <Link href="/docs" className="transition-colors hover:text-white">
              Docs
            </Link>
            <Link
              href="/login"
              className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-gray-900 transition-colors hover:bg-gray-200"
            >
              Sign In
            </Link>
          </div>
        </div>
      </nav>

      <div className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="mb-2 text-4xl font-bold">Privacy Policy</h1>
        <p className="mb-10 text-sm text-gray-400">
          Last updated:{" "}
          {new Date().toLocaleDateString("en-US", {
            month: "long",
            day: "numeric",
            year: "numeric",
          })}
        </p>

        <div className="prose prose-invert prose-headings:text-white prose-p:text-gray-300 prose-li:text-gray-300 prose-a:text-blue-400 max-w-none">
          <h2>1. Information We Collect</h2>
          <p>We collect information that you provide directly to us, including:</p>
          <ul>
            <li>
              <strong>Account information:</strong> Name, email address, password, and organization
              details when you register
            </li>
            <li>
              <strong>Email content:</strong> The content of emails you send and receive through the
              Service
            </li>
            <li>
              <strong>Usage data:</strong> Information about how you interact with the Service,
              including API usage, sending volumes, and feature usage
            </li>
            <li>
              <strong>Device information:</strong> Browser type, IP address, and device identifiers
            </li>
          </ul>

          <h2>2. How We Use Your Information</h2>
          <p>We use the information we collect to:</p>
          <ul>
            <li>Provide, maintain, and improve the Service</li>
            <li>Deliver and route your email messages</li>
            <li>Process transactions and send billing notifications</li>
            <li>Send service-related announcements and support messages</li>
            <li>Monitor and analyze usage patterns and trends</li>
            <li>Detect and prevent fraud, abuse, and security issues</li>
          </ul>

          <h2>3. Email Content</h2>
          <p>
            We process email content solely for the purpose of delivering the Service. We do not
            read, scan, or analyze your email content for advertising purposes. Email content is
            encrypted in transit using TLS and at rest using AES-256 encryption.
          </p>

          <h2>4. Data Sharing</h2>
          <p>We do not sell your personal information. We may share information with:</p>
          <ul>
            <li>
              <strong>Service providers:</strong> Third parties that help us operate the Service
              (hosting, payment processing)
            </li>
            <li>
              <strong>Legal requirements:</strong> When required by law, legal process, or
              government request
            </li>
            <li>
              <strong>Business transfers:</strong> In connection with a merger, acquisition, or sale
              of assets
            </li>
          </ul>

          <h2>5. Data Retention</h2>
          <p>
            We retain your data for as long as your account is active or as needed to provide the
            Service. After account deletion, we retain data for up to 30 days before permanent
            deletion. Billing records may be retained longer as required by law.
          </p>

          <h2>6. Security</h2>
          <p>
            We implement industry-standard security measures including encryption, access controls,
            and regular security audits. However, no method of transmission over the Internet is
            100% secure, and we cannot guarantee absolute security.
          </p>

          <h2>7. Your Rights</h2>
          <p>You have the right to:</p>
          <ul>
            <li>Access and download your personal data</li>
            <li>Correct inaccurate information</li>
            <li>Delete your account and associated data</li>
            <li>Export your email data</li>
            <li>Opt out of non-essential communications</li>
          </ul>

          <h2>8. Cookies and Tracking</h2>
          <p>
            We use essential cookies for authentication and session management. We do not use
            third-party tracking cookies for advertising. Analytics cookies are used solely to
            improve the Service and can be opted out of in your account settings.
          </p>

          <h2>9. International Data Transfers</h2>
          <p>
            Your data may be processed in countries other than your own. We ensure appropriate
            safeguards are in place for international transfers in compliance with applicable data
            protection laws.
          </p>

          <h2>10. Children&apos;s Privacy</h2>
          <p>
            The Service is not directed to individuals under the age of 16. We do not knowingly
            collect personal information from children.
          </p>

          <h2>11. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy periodically. We will notify you of material changes
            via email or through the Service at least 30 days before they take effect.
          </p>

          <h2>12. Contact Us</h2>
          <p>
            For privacy-related inquiries, contact us at{" "}
            <a href="mailto:privacy@oonrumail.com">privacy@oonrumail.com</a>.
          </p>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-white/10 py-8">
        <div className="mx-auto max-w-3xl px-6 text-center text-sm text-gray-500">
          © {new Date().getFullYear()} OonruMail. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
