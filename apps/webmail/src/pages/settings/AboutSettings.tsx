import { Info, ExternalLink, FileText, Shield } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function AboutSettings() {
  const version = "1.0.0";
  const buildDate = "2024-01-15";
  const commitHash = "a1b2c3d";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">About</h2>
        <p className="text-muted-foreground">
          Application information, release notes, and legal documents.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="h-5 w-5" />
            Version Information
          </CardTitle>
          <CardDescription>
            Current application version and build details.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium">Version</p>
              <Badge variant="secondary">{version}</Badge>
            </div>
            <div>
              <p className="text-sm font-medium">Build Date</p>
              <p className="text-sm text-muted-foreground">{buildDate}</p>
            </div>
            <div>
              <p className="text-sm font-medium">Commit</p>
              <code className="text-xs bg-muted px-2 py-1 rounded">
                {commitHash}
              </code>
            </div>
            <div>
              <p className="text-sm font-medium">Environment</p>
              <Badge variant="outline">Production</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Release Notes
          </CardTitle>
          <CardDescription>
            Latest updates and feature announcements.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div className="border-l-2 border-blue-500 pl-4">
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="default">v1.0.0</Badge>
                <span className="text-sm text-muted-foreground">Latest</span>
              </div>
              <p className="text-sm font-medium">Initial Release</p>
              <p className="text-xs text-muted-foreground">
                Complete webmail interface with modern tabbed settings
              </p>
            </div>

            <div className="border-l-2 border-gray-300 pl-4">
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="outline">v0.9.0</Badge>
                <span className="text-sm text-muted-foreground">Beta</span>
              </div>
              <p className="text-sm font-medium">Settings System</p>
              <p className="text-xs text-muted-foreground">
                Comprehensive user preferences and configuration
              </p>
            </div>
          </div>

          <Button variant="outline" className="w-full">
            <ExternalLink className="h-4 w-4 mr-2" />
            View Full Changelog
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Legal & Privacy
          </CardTitle>
          <CardDescription>
            Terms of service, privacy policy, and compliance information.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3">
            <Button variant="ghost" className="justify-start h-auto p-4">
              <div className="text-left">
                <p className="font-medium">Privacy Policy</p>
                <p className="text-sm text-muted-foreground">
                  How we collect, use, and protect your data
                </p>
              </div>
              <ExternalLink className="h-4 w-4 ml-auto" />
            </Button>

            <Button variant="ghost" className="justify-start h-auto p-4">
              <div className="text-left">
                <p className="font-medium">Terms of Service</p>
                <p className="text-sm text-muted-foreground">
                  User agreement and service conditions
                </p>
              </div>
              <ExternalLink className="h-4 w-4 ml-auto" />
            </Button>

            <Button variant="ghost" className="justify-start h-auto p-4">
              <div className="text-left">
                <p className="font-medium">Security & Compliance</p>
                <p className="text-sm text-muted-foreground">
                  Data protection and regulatory compliance
                </p>
              </div>
              <ExternalLink className="h-4 w-4 ml-auto" />
            </Button>

            <Button variant="ghost" className="justify-start h-auto p-4">
              <div className="text-left">
                <p className="font-medium">Open Source Licenses</p>
                <p className="text-sm text-muted-foreground">
                  Third-party software and attributions
                </p>
              </div>
              <ExternalLink className="h-4 w-4 ml-auto" />
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Support</CardTitle>
          <CardDescription>Get help and report issues.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button variant="outline" className="w-full justify-start">
            <ExternalLink className="h-4 w-4 mr-2" />
            Help Documentation
          </Button>
          <Button variant="outline" className="w-full justify-start">
            <ExternalLink className="h-4 w-4 mr-2" />
            Contact Support
          </Button>
          <Button variant="outline" className="w-full justify-start">
            <ExternalLink className="h-4 w-4 mr-2" />
            Report a Bug
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
