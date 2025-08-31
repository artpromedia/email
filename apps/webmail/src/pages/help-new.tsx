import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  Search,
  Book,
  Shield,
  Mail,
  Calendar,
  MessageCircle,
  ArrowLeft,
  FileText,
  Send,
  Clock,
} from "lucide-react";

// Help article structure
interface HelpArticle {
  id: string;
  title: string;
  description: string;
  category:
    | "getting-started"
    | "security"
    | "deliverability"
    | "calendar"
    | "chat";
  content: string; // MDX content
  tags: string[];
  lastUpdated: string;
}

// Categories configuration
const categories = [
  {
    id: "getting-started",
    name: "Getting Started",
    icon: Book,
    description: "Basic setup and first steps",
    color: "bg-blue-500",
  },
  {
    id: "security",
    name: "Security",
    icon: Shield,
    description: "Account security and privacy",
    color: "bg-green-500",
  },
  {
    id: "deliverability",
    name: "Deliverability",
    icon: Mail,
    description: "Email delivery and reputation",
    color: "bg-orange-500",
  },
  {
    id: "calendar",
    name: "Calendar",
    icon: Calendar,
    description: "Calendar and scheduling features",
    color: "bg-purple-500",
  },
  {
    id: "chat",
    name: "Chat",
    icon: MessageCircle,
    description: "Real-time messaging and collaboration",
    color: "bg-pink-500",
  },
];

// Sample help articles (in production, these would be loaded from MDX files)
const sampleArticles: HelpArticle[] = [
  {
    id: "getting-started-setup",
    title: "Setting up your CEERION Mail account",
    description: "Learn how to configure your account for the first time",
    category: "getting-started",
    content: `# Setting up your CEERION Mail account

Welcome to CEERION Mail! This guide will help you get started with your new email account.

## Initial Setup

1. **Verify your email address** - Check your inbox for a verification email
2. **Set up your profile** - Add your name and profile picture
3. **Configure email preferences** - Choose your notification settings

## Next Steps

- Set up email filters and rules
- Import contacts from other email providers
- Configure your email signature
- Enable two-factor authentication for security

*Need help? Contact our support team anytime.*`,
    tags: ["setup", "onboarding", "account"],
    lastUpdated: "2025-08-28",
  },
  {
    id: "security-2fa",
    title: "Enable Two-Factor Authentication",
    description: "Secure your account with two-factor authentication",
    category: "security",
    content: `# Enable Two-Factor Authentication

Two-factor authentication (2FA) adds an extra layer of security to your CEERION Mail account.

## Why Use 2FA?

- Protects against password breaches
- Prevents unauthorized access
- Required for enterprise accounts

## Setup Instructions

1. Go to **Settings** → **Security**
2. Click **Enable Two-Factor Authentication**
3. Scan the QR code with your authenticator app
4. Enter the verification code
5. Save your backup codes in a safe place

## Supported Apps

- Google Authenticator
- Authy
- Microsoft Authenticator
- 1Password

*Always keep your backup codes in a secure location.*`,
    tags: ["2fa", "security", "authentication"],
    lastUpdated: "2025-08-27",
  },
  {
    id: "deliverability-reputation",
    title: "Maintaining Email Reputation",
    description: "Best practices for email deliverability",
    category: "deliverability",
    content: `# Maintaining Email Reputation

Email reputation affects whether your messages reach the inbox or spam folder.

## Key Factors

### Authentication
- SPF records configured
- DKIM signing enabled
- DMARC policy in place

### Content Quality
- Avoid spam trigger words
- Use proper formatting
- Include clear unsubscribe links

### Sending Practices
- Maintain clean mailing lists
- Monitor bounce rates
- Respect recipient preferences

## Monitoring Tools

CEERION Mail provides built-in reputation monitoring:
- Delivery analytics
- Bounce rate tracking
- Spam score checking

*Good reputation takes time to build but can be lost quickly.*`,
    tags: ["deliverability", "reputation", "spam"],
    lastUpdated: "2025-08-26",
  },
  {
    id: "calendar-scheduling",
    title: "Calendar and Scheduling",
    description: "Manage meetings and events with the integrated calendar",
    category: "calendar",
    content: `# Calendar and Scheduling

CEERION Mail includes a powerful calendar for managing your schedule.

## Creating Events

1. Click the **+** button in the calendar
2. Add event title and description
3. Set date, time, and duration
4. Invite attendees by email
5. Set reminders and recurrence

## Meeting Integration

- Video call links automatically generated
- Room booking integration
- Timezone handling for global teams

## Calendar Sharing

- Share calendars with team members
- Set permission levels (view, edit, manage)
- Subscribe to external calendars

## Mobile Sync

Your calendar syncs across all devices:
- iOS Calendar app
- Google Calendar
- Outlook integration

*Pro tip: Use color coding to organize different types of events.*`,
    tags: ["calendar", "scheduling", "meetings"],
    lastUpdated: "2025-08-25",
  },
  {
    id: "chat-collaboration",
    title: "Real-time Chat and Collaboration",
    description: "Use chat features for instant team communication",
    category: "chat",
    content: `# Real-time Chat and Collaboration

Stay connected with your team using CEERION Mail's integrated chat features.

## Chat Features

### Direct Messages
- One-on-one conversations
- File sharing and attachments
- Message reactions and threading

### Group Chats
- Create team channels
- Organize by project or department
- Persistent message history

### Integration
- Link emails to chat conversations
- Share calendar events in chat
- Cross-reference contacts

## Collaboration Tools

- Screen sharing capabilities
- Document collaboration
- Voice and video calls
- Status indicators (online, away, busy)

## Mobile Experience

Full chat functionality on mobile:
- Push notifications
- Offline message sync
- Voice messages

*Use @mentions to get someone's attention in group chats.*`,
    tags: ["chat", "collaboration", "messaging"],
    lastUpdated: "2025-08-24",
  },
  {
    id: "rules-automation",
    title: "Email Rules and Automation",
    description: "Automate your email workflow with powerful rules",
    category: "getting-started",
    content: `# Email Rules and Automation

Save time by automating your email management with CEERION Mail's powerful rules engine.

## What are Email Rules?

Email rules automatically process incoming messages based on conditions you set:
- Sort emails into folders
- Apply labels for organization
- Forward important messages
- Mark emails as read/unread
- Delete spam automatically

## Creating Rules

1. Go to **Settings** → **Filters & Rules**
2. Click **Create New Rule**
3. Set conditions (from, subject, keywords)
4. Choose actions to perform
5. Test your rule with sample emails
6. Save and activate

## Advanced Features

- Multiple conditions with AND/OR logic
- Regular expressions for complex matching
- Time-based rules
- Priority ordering
- Import/export rule sets

## Best Practices

- Start with simple rules and add complexity gradually
- Test rules before activating them
- Use specific conditions to avoid false matches
- Regularly review and update your rules

*Rules are processed in order - put more specific rules first.*`,
    tags: ["rules", "automation", "filters", "workflow"],
    lastUpdated: "2025-08-29",
  },
];

// Sample changelog data
const changelogData = `# Changelog

## Version 2.1.0 - August 29, 2025

### New Features
- **Email Rules Engine**: Create sophisticated email filtering and automation rules
- **Advanced Search**: Enhanced search with filters and operators
- **Dark Mode**: System-wide dark theme support
- **Help Center**: Comprehensive help system with searchable articles

### Improvements
- Faster email loading with lazy loading
- Better mobile responsiveness
- Enhanced security with CSP headers

### Bug Fixes
- Fixed calendar sync issues
- Resolved attachment download problems
- Improved notification reliability

## Version 2.0.5 - August 15, 2025

### Security Updates
- Updated encryption protocols
- Enhanced 2FA implementation
- Improved audit logging

### Performance
- 40% faster email search
- Reduced memory usage
- Optimized database queries

## Version 2.0.0 - July 30, 2025

### Major Release
- Complete UI redesign
- New email composer
- Integrated calendar and chat
- Mobile app launch

### Breaking Changes
- API v1 deprecated (use v2)
- Legacy theme removed
- Old keyboard shortcuts updated
`;

export function HelpPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedArticle, setSelectedArticle] = useState<HelpArticle | null>(
    null,
  );
  const [showReleaseNotes, setShowReleaseNotes] = useState(false);
  const [filteredArticles, setFilteredArticles] =
    useState<HelpArticle[]>(sampleArticles);

  // Handle initial URL parameters
  useEffect(() => {
    const articleId = searchParams.get("article");
    const category = searchParams.get("category");
    const query = searchParams.get("q");

    if (articleId) {
      const article = sampleArticles.find((a) => a.id === articleId);
      if (article) {
        setSelectedArticle(article);
      }
    }

    if (category) {
      setSelectedCategory(category);
    }

    if (query) {
      setSearchQuery(query);
    }
  }, [searchParams]);

  // Filter articles based on search and category
  useEffect(() => {
    let filtered = sampleArticles;

    if (selectedCategory) {
      filtered = filtered.filter(
        (article) => article.category === selectedCategory,
      );
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (article) =>
          article.title.toLowerCase().includes(query) ||
          article.description.toLowerCase().includes(query) ||
          article.content.toLowerCase().includes(query) ||
          article.tags.some((tag) => tag.toLowerCase().includes(query)),
      );
    }

    setFilteredArticles(filtered);
  }, [searchQuery, selectedCategory]);

  const handleBack = () => {
    if (selectedArticle) {
      setSelectedArticle(null);
    } else {
      navigate("/mail/inbox");
    }
  };

  const handleContactSupport = () => {
    // In a real implementation, this would open the compose view with prefilled data
    toast({
      title: "Opening support draft",
      description: "Creating new email to support@ceerion.com...",
    });

    // Simulate opening compose with prefilled data
    setTimeout(() => {
      navigate(
        "/mail/compose?to=support@ceerion.com&subject=Support Request - Help Needed",
      );
    }, 500);
  };

  const renderArticleContent = (content: string) => {
    // Simple MDX-like rendering (in production, use a proper MDX renderer)
    return content.split("\n").map((line, index) => {
      if (line.startsWith("# ")) {
        return (
          <h1 key={index} className="text-3xl font-bold mb-4 mt-6">
            {line.slice(2)}
          </h1>
        );
      } else if (line.startsWith("## ")) {
        return (
          <h2 key={index} className="text-2xl font-semibold mb-3 mt-5">
            {line.slice(3)}
          </h2>
        );
      } else if (line.startsWith("### ")) {
        return (
          <h3 key={index} className="text-xl font-medium mb-2 mt-4">
            {line.slice(4)}
          </h3>
        );
      } else if (line.startsWith("- ")) {
        return (
          <li key={index} className="ml-4 mb-1">
            {line.slice(2)}
          </li>
        );
      } else if (line.startsWith("*") && line.endsWith("*")) {
        return (
          <p key={index} className="text-sm text-muted-foreground italic mb-2">
            {line.slice(1, -1)}
          </p>
        );
      } else if (line.trim()) {
        return (
          <p key={index} className="mb-3 leading-relaxed">
            {line}
          </p>
        );
      }
      return <br key={index} />;
    });
  };

  if (selectedArticle) {
    return (
      <div className="flex flex-col h-full bg-background">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={handleBack}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">{selectedArticle.title}</h1>
              <p className="text-sm text-muted-foreground">
                Last updated: {selectedArticle.lastUpdated}
              </p>
            </div>
          </div>
          <Button onClick={handleContactSupport} className="gap-2">
            <Send className="h-4 w-4" />
            Contact Support
          </Button>
        </div>

        {/* Article Content */}
        <div className="flex-1 overflow-auto">
          <div className="max-w-4xl mx-auto p-6">
            <div className="mb-6">
              <Badge variant="secondary" className="mb-2">
                {
                  categories.find((c) => c.id === selectedArticle.category)
                    ?.name
                }
              </Badge>
              <div className="flex flex-wrap gap-2">
                {selectedArticle.tags.map((tag) => (
                  <Badge key={tag} variant="outline" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="prose prose-neutral dark:prose-invert max-w-none">
              {renderArticleContent(selectedArticle.content)}
            </div>

            <div className="mt-8 p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground mb-2">
                Was this article helpful?
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm">
                  Yes
                </Button>
                <Button variant="outline" size="sm">
                  No
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleContactSupport}
                >
                  Contact Support
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={handleBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Help Center</h1>
            <p className="text-sm text-muted-foreground">
              Find answers and get support
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setShowReleaseNotes(!showReleaseNotes)}
            className="gap-2"
          >
            <Clock className="h-4 w-4" />
            Release Notes
          </Button>
          <Button onClick={handleContactSupport} className="gap-2">
            <Send className="h-4 w-4" />
            Contact Support
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <div className="flex h-full">
          {/* Main Content */}
          <div className="flex-1 flex flex-col">
            {/* Search */}
            <div className="p-6 border-b">
              <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search help articles..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            {/* Categories */}
            <div className="p-6 border-b">
              <h2 className="text-lg font-semibold mb-4">Browse by Category</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {categories.map((category) => {
                  const Icon = category.icon;
                  const isSelected = selectedCategory === category.id;

                  return (
                    <Card
                      key={category.id}
                      className={`cursor-pointer transition-all duration-200 hover:shadow-md ${
                        isSelected ? "ring-2 ring-primary" : ""
                      }`}
                      onClick={() =>
                        setSelectedCategory(isSelected ? null : category.id)
                      }
                    >
                      <CardContent className="pt-6">
                        <div className="flex items-center gap-3 mb-2">
                          <div
                            className={`p-2 rounded-lg ${category.color} text-white`}
                          >
                            <Icon className="h-4 w-4" />
                          </div>
                          <h3 className="font-medium">{category.name}</h3>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {category.description}
                        </p>
                        <p className="text-xs text-muted-foreground mt-2">
                          {
                            sampleArticles.filter(
                              (a) => a.category === category.id,
                            ).length
                          }{" "}
                          articles
                        </p>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>

            {/* Articles */}
            <div className="flex-1 overflow-auto p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">
                  {selectedCategory
                    ? `${categories.find((c) => c.id === selectedCategory)?.name} Articles`
                    : searchQuery
                      ? `Search Results (${filteredArticles.length})`
                      : "All Articles"}
                </h2>
                {selectedCategory && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedCategory(null)}
                  >
                    View All
                  </Button>
                )}
              </div>

              <div className="space-y-4">
                {filteredArticles.map((article) => (
                  <Card
                    key={article.id}
                    className="cursor-pointer transition-all duration-200 hover:shadow-md"
                    onClick={() => setSelectedArticle(article)}
                  >
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-lg">
                            {article.title}
                          </CardTitle>
                          <CardDescription className="mt-1">
                            {article.description}
                          </CardDescription>
                        </div>
                        <Badge variant="secondary">
                          {
                            categories.find((c) => c.id === article.category)
                              ?.name
                          }
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>Updated {article.lastUpdated}</span>
                        <span>•</span>
                        <div className="flex gap-1">
                          {article.tags.slice(0, 3).map((tag) => (
                            <Badge
                              key={tag}
                              variant="outline"
                              className="text-xs"
                            >
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </CardHeader>
                  </Card>
                ))}

                {filteredArticles.length === 0 && (
                  <div className="text-center py-12">
                    <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-medium mb-2">
                      No articles found
                    </h3>
                    <p className="text-muted-foreground mb-4">
                      Try adjusting your search or browse by category
                    </p>
                    <Button onClick={handleContactSupport} variant="outline">
                      Contact Support
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Release Notes Sidebar */}
          {showReleaseNotes && (
            <>
              <Separator orientation="vertical" />
              <div className="w-80 border-l">
                <div className="p-4 border-b">
                  <h3 className="font-semibold">Release Notes</h3>
                </div>
                <div className="h-full p-4 overflow-auto">
                  <div className="prose prose-sm prose-neutral dark:prose-invert max-w-none">
                    {renderArticleContent(changelogData)}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
