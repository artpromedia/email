import { Link } from "react-router-dom";
import {
  HelpCircle,
  Book,
  MessageSquare,
  Mail,
  Shield,
  Settings,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function HelpPage() {
  const helpTopics = [
    {
      icon: Mail,
      title: "Getting Started",
      description: "Learn the basics of CEERION Mail",
      items: [
        "Setting up your account",
        "Organizing your inbox",
        "Composing messages",
        "Managing contacts",
      ],
    },
    {
      icon: Shield,
      title: "Security & Privacy",
      description: "Keep your mail secure",
      items: [
        "Two-factor authentication",
        "Email encryption",
        "Spam protection",
        "Privacy settings",
      ],
    },
    {
      icon: Settings,
      title: "Advanced Features",
      description: "Make the most of CEERION Mail",
      items: [
        "Filters and rules",
        "Labels and categories",
        "Keyboard shortcuts",
        "Integration settings",
      ],
    },
  ];

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="p-6 border-b">
        <div className="flex items-center gap-3">
          <HelpCircle className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Help Center</h1>
            <p className="text-muted-foreground">
              Find answers and learn about CEERION Mail
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto space-y-8">
          {/* Quick Actions */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="text-center">
                <Book className="h-8 w-8 mx-auto text-primary" />
                <CardTitle className="text-lg">Documentation</CardTitle>
                <CardDescription>Complete guides and tutorials</CardDescription>
              </CardHeader>
              <CardContent>
                <Button className="w-full" variant="outline">
                  Browse Docs
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="text-center">
                <MessageSquare className="h-8 w-8 mx-auto text-primary" />
                <CardTitle className="text-lg">Contact Support</CardTitle>
                <CardDescription>Get help from our team</CardDescription>
              </CardHeader>
              <CardContent>
                <Button className="w-full" variant="outline">
                  Contact Us
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="text-center">
                <HelpCircle className="h-8 w-8 mx-auto text-primary" />
                <CardTitle className="text-lg">FAQ</CardTitle>
                <CardDescription>Frequently asked questions</CardDescription>
              </CardHeader>
              <CardContent>
                <Button className="w-full" variant="outline">
                  View FAQ
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Help Topics */}
          <div className="space-y-6">
            <h2 className="text-xl font-semibold">Popular Topics</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {helpTopics.map((topic, index) => {
                const Icon = topic.icon;
                return (
                  <Card key={index}>
                    <CardHeader>
                      <Icon className="h-6 w-6 text-primary" />
                      <CardTitle className="text-lg">{topic.title}</CardTitle>
                      <CardDescription>{topic.description}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2">
                        {topic.items.map((item, itemIndex) => (
                          <li key={itemIndex}>
                            <Link
                              to="#"
                              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                            >
                              {item}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>

          {/* Contact Information */}
          <Card>
            <CardHeader>
              <CardTitle>Need More Help?</CardTitle>
              <CardDescription>
                If you can't find what you're looking for, our support team is
                here to help.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h4 className="font-medium mb-2">Email Support</h4>
                  <p className="text-sm text-muted-foreground">
                    support@ceerion.com
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Response within 24 hours
                  </p>
                </div>
                <div>
                  <h4 className="font-medium mb-2">System Status</h4>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <span className="text-sm text-muted-foreground">
                      All systems operational
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
