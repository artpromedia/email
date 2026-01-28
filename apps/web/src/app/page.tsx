import Link from "next/link";
import { Mail, Shield, Globe, Zap } from "lucide-react";

import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Badge } from "@email/ui";

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-2">
            <Mail className="h-6 w-6 text-primary" />
            <span className="text-xl font-bold">Enterprise Email</span>
          </div>
          <nav className="flex items-center gap-4">
            <Link href="/login">
              <Button variant="ghost">Sign In</Button>
            </Link>
            <Link href="/register">
              <Button>Get Started</Button>
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1">
        <section className="container flex flex-col items-center justify-center gap-8 py-24 text-center">
          <Badge variant="secondary" className="px-4 py-1">
            Multi-Domain Support
          </Badge>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl lg:text-7xl">
            Enterprise Email
            <br />
            <span className="text-primary">Built for Scale</span>
          </h1>
          <p className="max-w-[42rem] leading-normal text-muted-foreground sm:text-xl sm:leading-8">
            Powerful email infrastructure with multi-domain support, advanced security features,
            and complete control over your email communications.
          </p>
          <div className="flex gap-4">
            <Link href="/register">
              <Button size="lg">Start Free Trial</Button>
            </Link>
            <Link href="/docs">
              <Button size="lg" variant="outline">
                Documentation
              </Button>
            </Link>
          </div>
        </section>

        {/* Features Section */}
        <section className="container py-24">
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <Globe className="h-10 w-10 text-primary" />
                <CardTitle className="mt-4">Multi-Domain Support</CardTitle>
                <CardDescription>
                  Manage multiple domains from a single dashboard. Perfect for enterprises with
                  subsidiaries or multiple brands.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="list-inside list-disc text-sm text-muted-foreground">
                  <li>Unlimited domains per organization</li>
                  <li>Per-domain DKIM signing</li>
                  <li>Custom SPF and DMARC policies</li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <Shield className="h-10 w-10 text-primary" />
                <CardTitle className="mt-4">Enterprise Security</CardTitle>
                <CardDescription>
                  Bank-grade security with encryption at rest and in transit. Full audit logging
                  and compliance support.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="list-inside list-disc text-sm text-muted-foreground">
                  <li>End-to-end encryption</li>
                  <li>Two-factor authentication</li>
                  <li>SSO integration</li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <Zap className="h-10 w-10 text-primary" />
                <CardTitle className="mt-4">High Performance</CardTitle>
                <CardDescription>
                  Built for scale with distributed architecture. Handle millions of emails with
                  low latency delivery.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="list-inside list-disc text-sm text-muted-foreground">
                  <li>99.99% uptime SLA</li>
                  <li>Global delivery network</li>
                  <li>Real-time analytics</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t py-8">
        <div className="container flex flex-col items-center justify-between gap-4 md:flex-row">
          <p className="text-sm text-muted-foreground">
            © 2026 Enterprise Email. All rights reserved.
          </p>
          <nav className="flex gap-4 text-sm text-muted-foreground">
            <Link href="/privacy" className="hover:underline">
              Privacy
            </Link>
            <Link href="/terms" className="hover:underline">
              Terms
            </Link>
            <Link href="/contact" className="hover:underline">
              Contact
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
