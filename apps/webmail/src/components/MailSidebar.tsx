import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Inbox,
  Star,
  Clock,
  Send,
  FileText,
  Calendar,
  Archive,
  Trash2,
  AlertTriangle,
  Shield,
  HelpCircle,
  Plus,
  ChevronDown,
  ChevronRight,
  Settings,
  Mail,
  Tag,
  Zap,
  Bookmark,
  MessageCircle,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { CreateLabelDialog } from "./CreateLabelDialog";
import { useMail } from "@/contexts/MailContext";
import { cn } from "@/lib/utils";

interface MailSidebarProps {
  onCompose: () => void;
}

export function MailSidebar({ onCompose }: MailSidebarProps) {
  const [labelsOpen, setLabelsOpen] = useState(true);
  const [categoriesOpen, setCategoriesOpen] = useState(true);
  const [showCreateLabel, setShowCreateLabel] = useState(false);
  const {
    folderCounts,
    labels,
    categories,
    currentView,
    currentCategory,
    currentLabel,
  } = useMail();
  const location = window.location;

  const folders = [
    { id: "inbox", name: "Inbox", icon: Inbox, count: folderCounts.inbox },
    { id: "starred", name: "Starred", icon: Star, count: folderCounts.starred },
    {
      id: "snoozed",
      name: "Snoozed",
      icon: Clock,
      count: folderCounts.snoozed,
    },
    {
      id: "important",
      name: "Important",
      icon: Zap,
      count: folderCounts.important,
    },
    { id: "sent", name: "Sent", icon: Send, count: folderCounts.sent },
    {
      id: "drafts",
      name: "Drafts",
      icon: FileText,
      count: folderCounts.drafts,
    },
    {
      id: "scheduled",
      name: "Scheduled",
      icon: Calendar,
      count: folderCounts.scheduled,
    },
    {
      id: "outbox",
      name: "Outbox",
      icon: Bookmark,
      count: folderCounts.outbox,
    },
    {
      id: "archive",
      name: "Archive",
      icon: Archive,
      count: folderCounts.archive,
    },
    { id: "spam", name: "Spam", icon: AlertTriangle, count: folderCounts.spam },
    { id: "trash", name: "Trash", icon: Trash2, count: folderCounts.trash },
    { id: "all", name: "All Mail", icon: Mail, count: folderCounts.all },
  ];

  const isActive = (view: string, category?: string, label?: string) => {
    if (category) {
      return currentCategory === category;
    }
    if (label) {
      return currentLabel === label;
    }
    return currentView === view;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Compose Button */}
      <div className="p-4">
        <Button onClick={onCompose} className="w-full" size="lg">
          <Plus className="mr-2 h-4 w-4" />
          Compose
        </Button>
      </div>

      {/* Apps Navigation */}
      <div className="px-4 pb-2">
        <div className="space-y-1">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
            Apps
          </h3>
          <Link
            to="/mail/inbox"
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
              location.pathname.startsWith("/mail")
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted text-foreground",
            )}
          >
            <Mail className="h-4 w-4" />
            <span>Mail</span>
          </Link>
          <Link
            to="/chat"
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
              location.pathname === "/chat"
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted text-foreground",
            )}
          >
            <MessageCircle className="h-4 w-4" />
            <span>Chat</span>
          </Link>
          <Link
            to="/contacts"
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
              location.pathname === "/contacts"
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted text-foreground",
            )}
          >
            <Users className="h-4 w-4" />
            <span>Contacts</span>
          </Link>
          <Link
            to="/calendar"
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
              location.pathname === "/calendar"
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted text-foreground",
            )}
          >
            <Calendar className="h-4 w-4" />
            <span>Calendar</span>
          </Link>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 pb-4 space-y-6 overflow-y-auto">
        {/* System Folders */}
        <div className="space-y-1">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
            Folders
          </h3>
          {folders.map((folder) => {
            const Icon = folder.icon;
            return (
              <Link
                key={folder.id}
                to={`/mail/${folder.id}`}
                className={cn(
                  "flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors group",
                  isActive(folder.id)
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted text-foreground",
                )}
              >
                <div className="flex items-center gap-3">
                  <Icon className="h-4 w-4" />
                  <span>{folder.name}</span>
                </div>
                {folder.count > 0 && (
                  <Badge
                    variant={isActive(folder.id) ? "secondary" : "default"}
                    className={cn(
                      "h-5 px-1.5 text-xs",
                      isActive(folder.id) &&
                        "bg-primary-foreground/20 text-primary-foreground",
                    )}
                  >
                    {folder.count}
                  </Badge>
                )}
              </Link>
            );
          })}
        </div>

        {/* Categories */}
        <div className="space-y-1">
          <Collapsible open={categoriesOpen} onOpenChange={setCategoriesOpen}>
            <CollapsibleTrigger className="flex items-center justify-between w-full text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 hover:text-foreground">
              <span>Categories</span>
              {categoriesOpen ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-1">
              {categories.map((category) => (
                <Link
                  key={category.id}
                  to={`/mail/category/${category.id}`}
                  className={cn(
                    "flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                    isActive("", category.id)
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted text-foreground",
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "w-2 h-2 rounded-full",
                        category.id === "primary" && "bg-blue-500",
                        category.id === "social" && "bg-green-500",
                        category.id === "promotions" && "bg-yellow-500",
                        category.id === "updates" && "bg-orange-500",
                        category.id === "forums" && "bg-purple-500",
                      )}
                    />
                    <span>{category.name}</span>
                  </div>
                  {category.unreadCount > 0 && (
                    <Badge
                      variant={
                        isActive("", category.id) ? "secondary" : "default"
                      }
                      className={cn(
                        "h-5 px-1.5 text-xs",
                        isActive("", category.id) &&
                          "bg-primary-foreground/20 text-primary-foreground",
                      )}
                    >
                      {category.unreadCount}
                    </Badge>
                  )}
                </Link>
              ))}
            </CollapsibleContent>
          </Collapsible>
        </div>

        {/* Labels */}
        <div className="space-y-1">
          <Collapsible open={labelsOpen} onOpenChange={setLabelsOpen}>
            <CollapsibleTrigger className="flex items-center justify-between w-full text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 hover:text-foreground">
              <span>Labels</span>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-4 w-4 p-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowCreateLabel(true);
                  }}
                >
                  <Plus className="h-3 w-3" />
                </Button>
                {labelsOpen ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-1">
              {labels.map((label) => (
                <Link
                  key={label.id}
                  to={`/mail/label/${label.id}`}
                  className={cn(
                    "flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                    isActive("", "", label.id)
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted text-foreground",
                  )}
                >
                  <div className="flex items-center gap-3">
                    <Tag className="h-4 w-4" style={{ color: label.color }} />
                    <span>{label.name}</span>
                  </div>
                  {label.unreadCount > 0 && (
                    <Badge
                      variant={
                        isActive("", "", label.id) ? "secondary" : "default"
                      }
                      className={cn(
                        "h-5 px-1.5 text-xs",
                        isActive("", "", label.id) &&
                          "bg-primary-foreground/20 text-primary-foreground",
                      )}
                    >
                      {label.unreadCount}
                    </Badge>
                  )}
                </Link>
              ))}
            </CollapsibleContent>
          </Collapsible>
        </div>

        {/* Other Links */}
        <div className="space-y-1">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
            More
          </h3>

          <Link
            to="/mail/quarantine"
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
              location.pathname === "/mail/quarantine"
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted text-foreground",
            )}
          >
            <Shield className="h-4 w-4" />
            <span>Quarantine</span>
            {folderCounts.spam > 0 && (
              <Badge
                variant="destructive"
                className="h-5 px-1.5 text-xs ml-auto"
              >
                {folderCounts.spam}
              </Badge>
            )}
          </Link>

          <Link
            to="/help"
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
              location.pathname === "/help"
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted text-foreground",
            )}
          >
            <HelpCircle className="h-4 w-4" />
            <span>Help Center</span>
          </Link>

          <Link
            to="/settings"
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
              location.pathname.startsWith("/settings")
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted text-foreground",
            )}
          >
            <Settings className="h-4 w-4" />
            <span>Settings</span>
          </Link>
        </div>
      </nav>

      {/* Create Label Dialog */}
      <CreateLabelDialog
        open={showCreateLabel}
        onOpenChange={setShowCreateLabel}
      />
    </div>
  );
}
