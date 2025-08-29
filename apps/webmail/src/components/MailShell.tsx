import { useState } from "react";
import { useNavigate, Routes, Route, Navigate } from "react-router-dom";
import { Search, Bell, Settings, User, LogOut, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MailSidebar } from "./MailSidebar";
import { MailList } from "./MailList";
import { MailThread } from "./MailThread";
import { ComposeSheet } from "./ComposeSheet";
import { HelpPage } from "@/pages/help";
import { SettingsPage } from "@/pages/settings";
import { useMail } from "@/contexts/MailContext";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

export function MailShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showCompose, setShowCompose] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { selectedThread } = useMail();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: Implement search
    console.log("Search:", searchQuery);
  };

  const handleProfileClick = () => {
    navigate("/settings/profile");
  };

  const handleSettingsClick = () => {
    navigate("/settings");
  };

  const handleLogout = () => {
    logout();
  };

  return (
    <div className="flex h-screen bg-background">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between h-16 px-6 bg-background border-b">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            {sidebarOpen ? (
              <X className="h-4 w-4" />
            ) : (
              <Menu className="h-4 w-4" />
            )}
          </Button>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
                <span className="text-white text-sm font-bold">C</span>
              </div>
              <div>
                <h1 className="text-lg font-semibold">CEERION Mail</h1>
                <p className="text-xs text-muted-foreground">
                  mail.ceerion.com
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Search Bar */}
          <form onSubmit={handleSearch} className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search mail..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 w-80"
            />
          </form>

          {/* Notifications */}
          <Button variant="ghost" size="icon">
            <Bell className="h-4 w-4" />
          </Button>

          {/* Profile Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={user?.avatar} alt={user?.name} />
                  <AvatarFallback>
                    {user?.name
                      ?.split(" ")
                      .map((n) => n[0])
                      .join("")
                      .toUpperCase() || "U"}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end" forceMount>
              <div className="flex items-center justify-start gap-2 p-2">
                <div className="flex flex-col space-y-1 leading-none">
                  <p className="font-medium">{user?.name}</p>
                  <p className="text-xs leading-none text-muted-foreground">
                    {user?.email}
                  </p>
                </div>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleProfileClick}>
                <User className="mr-2 h-4 w-4" />
                Profile
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleSettingsClick}>
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout}>
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex flex-1 pt-16">
        {/* Sidebar */}
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-40 w-80 bg-background border-r transform transition-transform duration-200 ease-in-out lg:relative lg:translate-x-0",
            sidebarOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <div className="h-full pt-16 lg:pt-0">
            <MailSidebar onCompose={() => setShowCompose(true)} />
          </div>
        </aside>

        {/* Mobile overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-30 bg-background/80 backdrop-blur-sm lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Main Content Area */}
        <div className="flex-1 flex">
          <Routes>
            <Route path="/" element={<Navigate to="/mail/inbox" replace />} />
            <Route path="/help" element={<HelpPage />} />
            <Route path="/settings/*" element={<SettingsPage />} />
            <Route
              path="/mail/*"
              element={
                <>
                  {/* Mail List */}
                  <div
                    className={cn(
                      "w-full lg:w-96 border-r bg-background",
                      selectedThread && "hidden lg:block",
                    )}
                  >
                    <MailList />
                  </div>

                  {/* Thread View */}
                  <div
                    className={cn(
                      "flex-1 bg-background",
                      !selectedThread && "hidden lg:block",
                    )}
                  >
                    {selectedThread ? (
                      <MailThread />
                    ) : (
                      <div className="flex items-center justify-center h-full text-muted-foreground">
                        <div className="text-center">
                          <div className="w-24 h-24 mx-auto mb-4 bg-muted rounded-full flex items-center justify-center">
                            <Search className="h-12 w-12" />
                          </div>
                          <h3 className="text-lg font-medium mb-2">
                            No message selected
                          </h3>
                          <p className="text-sm">
                            Choose a message from your inbox to read
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              }
            />
          </Routes>
        </div>
      </div>

      {/* Compose Sheet */}
      <ComposeSheet
        isOpen={showCompose}
        onClose={() => setShowCompose(false)}
      />
    </div>
  );
}
