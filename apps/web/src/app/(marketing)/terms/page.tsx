/**
 * Terms of Service Page
 * Legal terms for OonruMail platform
 */

import Link from "next/link";
import { type Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service — OonruMail",
  description: "Terms of Service for the OonruMail email platform.",
};

export default function TermsPage() {
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
        <h1 className="mb-2 text-4xl font-bold">Terms of Service</h1>
        <p className="mb-10 text-sm text-gray-400">
          Last updated:{" "}
          {new Date().toLocaleDateString("en-US", {
            month: "long",
            day: "numeric",
            year: "numeric",
          })}
        </p>

        <div className="prose prose-invert prose-headings:text-white prose-p:text-gray-300 prose-li:text-gray-300 prose-a:text-blue-400 max-w-none">
          <h2>1. Acceptance of Terms</h2>
          <p>
            By accessing or using OonruMail (&quot;the Service&quot;), you agree to be bound by
            these Terms of Service. If you do not agree, do not use the Service.
          </p>

          <h2>2. Description of Service</h2>
          <p>
            OonruMail provides email hosting, transactional email delivery, and related
            communication services for businesses and individuals. The Service includes web-based
            email, API access for transactional email sending, domain management, and team
            collaboration tools.
          </p>

          <h2>3. Account Registration</h2>
          <p>
            You must provide accurate and complete information when creating an account. You are
            responsible for maintaining the confidentiality of your account credentials and for all
            activities that occur under your account.
          </p>

          <h2>4. Acceptable Use</h2>
          <p>You agree not to use the Service to:</p>
          <ul>
            <li>Send unsolicited bulk email (spam)</li>
            <li>Distribute malware, phishing, or fraudulent content</li>
            <li>Violate any applicable laws or regulations</li>
            <li>Infringe on the intellectual property rights of others</li>
            <li>Harass, abuse, or threaten other users</li>
            <li>Attempt to gain unauthorized access to the Service or related systems</li>
          </ul>

          <h2>5. Service Plans and Billing</h2>
          <p>
            OonruMail offers various service plans including free and paid tiers. Paid plans are
            billed on a monthly or annual basis. You agree to pay all applicable fees. We reserve
            the right to modify pricing with 30 days advance notice.
          </p>

          <h2>6. Email Sending Limits</h2>
          <p>
            Each plan has designated sending limits. Exceeding your plan&apos;s limits may result in
            temporary sending restrictions or additional charges as specified in your plan details.
          </p>

          <h2>7. Data Privacy</h2>
          <p>
            Your use of the Service is also governed by our Privacy Policy. We process email data
            solely for the purpose of delivering the Service. We do not sell your personal data to
            third parties.
          </p>

          <h2>8. Intellectual Property</h2>
          <p>
            The Service, including its design, features, and content, is owned by OonruMail and
            protected by intellectual property laws. You retain ownership of all content you send or
            store through the Service.
          </p>

          <h2>9. Service Availability</h2>
          <p>
            We strive for 99.9% uptime but do not guarantee uninterrupted service. We may perform
            maintenance with reasonable advance notice. We are not liable for downtime beyond our
            control.
          </p>

          <h2>10. Termination</h2>
          <p>
            Either party may terminate this agreement at any time. Upon termination, your access to
            the Service will cease. We will retain your data for 30 days after termination, after
            which it may be permanently deleted.
          </p>

          <h2>11. Limitation of Liability</h2>
          <p>
            To the maximum extent permitted by law, OonruMail shall not be liable for any indirect,
            incidental, special, consequential, or punitive damages, or any loss of profits or data.
          </p>

          <h2>12. Changes to Terms</h2>
          <p>
            We may update these Terms from time to time. We will notify you of material changes via
            email or through the Service. Continued use after changes constitutes acceptance.
          </p>

          <h2>13. Contact</h2>
          <p>
            If you have questions about these Terms, contact us at{" "}
            <a href="mailto:legal@oonrumail.com">legal@oonrumail.com</a>.
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
