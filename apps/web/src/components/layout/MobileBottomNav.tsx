"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { Inbox, Search, Star, FolderOpen, Settings, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

// ============================================================================
// Types
// ============================================================================

interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  href: string;
  badge?: number;
}

interface MobileBottomNavProps {
  /** Optional additional CSS classes */
  className?: string;
  /** Unread count for inbox badge */
  unreadCount?: number;
  /** Whether the nav is currently visible */
  visible?: boolean;
  /** Callback when a nav item is tapped */
  onNavigate?: (href: string) => void;
}

// ============================================================================
// Constants
// ============================================================================

const NAV_ITEMS: NavItem[] = [
  {
    id: "inbox",
    label: "Inbox",
    icon: Inbox,
    href: "/mail/inbox",
  },
  {
    id: "search",
    label: "Search",
    icon: Search,
    href: "/mail/search",
  },
  {
    id: "starred",
    label: "Starred",
    icon: Star,
    href: "/mail/starred",
  },
  {
    id: "folders",
    label: "Folders",
    icon: FolderOpen,
    href: "/mail/folders",
  },
  {
    id: "settings",
    label: "Settings",
    icon: Settings,
    href: "/settings",
  },
];

// ============================================================================
// Hooks
// ============================================================================

/**
 * Hook to detect if user is scrolling down (to hide nav) or up (to show nav)
 */
function useScrollDirection(threshold = 10) {
  const [scrollDirection, setScrollDirection] = React.useState<"up" | "down">("up");
  const [isAtTop, setIsAtTop] = React.useState(true);
  const lastScrollY = React.useRef(0);

  React.useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      const difference = currentScrollY - lastScrollY.current;

      setIsAtTop(currentScrollY < 50);

      if (Math.abs(difference) > threshold) {
        setScrollDirection(difference > 0 ? "down" : "up");
        lastScrollY.current = currentScrollY;
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [threshold]);

  return { scrollDirection, isAtTop };
}

/**
 * Hook to detect if the keyboard is open (to hide nav on mobile)
 */
function useKeyboardVisible() {
  const [isKeyboardVisible, setIsKeyboardVisible] = React.useState(false);

  React.useEffect(() => {
    // Visual Viewport API for better keyboard detection
    if (typeof window !== "undefined" && window.visualViewport) {
      const viewport = window.visualViewport;
      const initialHeight = viewport.height;

      const handleResize = () => {
        // If viewport height decreased significantly, keyboard is likely open
        const heightDiff = initialHeight - viewport.height;
        setIsKeyboardVisible(heightDiff > 150);
      };

      viewport.addEventListener("resize", handleResize);
      return () => viewport.removeEventListener("resize", handleResize);
    }
  }, []);

  return isKeyboardVisible;
}

// ============================================================================
// Components
// ============================================================================

interface NavItemButtonProps {
  item: NavItem;
  isActive: boolean;
  badge?: number;
  onClick: () => void;
}

function NavItemButton({ item, isActive, badge, onClick }: NavItemButtonProps) {
  const Icon = item.icon;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-1 flex-col items-center justify-center gap-0.5 py-2 transition-colors",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
        "transform active:scale-95",
        isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
      )}
      aria-current={isActive ? "page" : undefined}
      aria-label={`${item.label}${badge ? `, ${badge} unread` : ""}`}
    >
      <span className="relative">
        <Icon
          className={cn("h-5 w-5 transition-transform", isActive && "scale-110")}
          aria-hidden="true"
        />
        {badge !== undefined && badge > 0 && (
          <span
            className={cn(
              "absolute -right-2.5 -top-1.5 flex h-4 min-w-[1rem] items-center justify-center",
              "rounded-full bg-destructive px-1 text-[10px] font-medium text-destructive-foreground"
            )}
            aria-hidden="true"
          >
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </span>
      <span
        className={cn(
          "text-[10px] font-medium transition-opacity",
          isActive ? "opacity-100" : "opacity-70"
        )}
      >
        {item.label}
      </span>
    </button>
  );
}

/**
 * Mobile bottom navigation bar component
 *
 * Features:
 * - Auto-hides on scroll down, shows on scroll up
 * - Hides when keyboard is open
 * - Supports badge counts for unread emails
 * - Accessible with proper ARIA attributes
 * - Safe area aware for notched devices
 *
 * @example
 * ```tsx
 * <MobileBottomNav unreadCount={5} />
 * ```
 */
export function MobileBottomNav({
  className,
  unreadCount,
  visible = true,
  onNavigate,
}: MobileBottomNavProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { scrollDirection, isAtTop } = useScrollDirection();
  const isKeyboardVisible = useKeyboardVisible();

  // Hide when scrolling down, keyboard open, or explicitly hidden
  const shouldShow = visible && !isKeyboardVisible && (isAtTop || scrollDirection === "up");

  const handleNavigation = (href: string) => {
    onNavigate?.(href);
    router.push(href);
  };

  // Determine which nav item is active based on current path
  const getIsActive = (item: NavItem): boolean => {
    if (item.href === "/mail/inbox") {
      return (
        pathname === "/mail" || pathname === "/mail/inbox" || pathname.startsWith("/mail/inbox/")
      );
    }
    return pathname.startsWith(item.href);
  };

  return (
    <nav
      className={cn(
        // Only show on mobile/small tablets
        "md:hidden",
        // Fixed at bottom
        "fixed inset-x-0 bottom-0 z-50",
        // Styling
        "border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80",
        // Safe area padding for notched devices (iPhone X+)
        "pb-[env(safe-area-inset-bottom,0px)]",
        // Transition for show/hide
        "transform transition-transform duration-300 ease-out",
        shouldShow ? "translate-y-0" : "translate-y-full",
        className
      )}
      role="navigation"
      aria-label="Main navigation"
    >
      <div className="flex h-14 items-stretch justify-around">
        {NAV_ITEMS.map((item) => (
          <NavItemButton
            key={item.id}
            item={item}
            isActive={getIsActive(item)}
            badge={item.id === "inbox" ? unreadCount : undefined}
            onClick={() => handleNavigation(item.href)}
          />
        ))}
      </div>
    </nav>
  );
}

// ============================================================================
// Context for controlling visibility from other components
// ============================================================================

interface MobileNavContextValue {
  visible: boolean;
  setVisible: (visible: boolean) => void;
  hide: () => void;
  show: () => void;
}

const MobileNavContext = React.createContext<MobileNavContextValue | null>(null);

export function MobileNavProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = React.useState(true);

  const value = React.useMemo(
    () => ({
      visible,
      setVisible,
      hide: () => setVisible(false),
      show: () => setVisible(true),
    }),
    [visible]
  );

  return <MobileNavContext.Provider value={value}>{children}</MobileNavContext.Provider>;
}

export function useMobileNav() {
  const context = React.useContext(MobileNavContext);
  if (!context) {
    throw new Error("useMobileNav must be used within a MobileNavProvider");
  }
  return context;
}

export default MobileBottomNav;
