import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import { toast } from "react-hot-toast";

// Mock client for development
const createCeerionMailClient = () => ({
  auth: {
    login: async (credentials: any) => {
      // Mock successful login for admin
      if (
        credentials.email === "admin@ceerion.com" &&
        credentials.password === "admin123"
      ) {
        return {
          success: true,
          user: {
            id: "admin-1",
            email: "admin@ceerion.com",
            role: "admin",
            name: "Admin User",
            permissions: ["read", "write", "admin"],
          },
        };
      }
      return { success: false, error: "Invalid credentials" };
    },
    logout: async () => ({ success: true }),
    getCurrentUser: async () => null,
  },
});

interface AdminUser {
  id: string;
  email: string;
  role: "admin" | "super_admin";
  name: string;
  permissions: string[];
}

interface AdminAuthContextType {
  user: AdminUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  client: ReturnType<typeof createCeerionMailClient>;
}

const AdminAuthContext = createContext<AdminAuthContextType | undefined>(
  undefined,
);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const client = createCeerionMailClient();

  const verifyAdminToken = useCallback(async (_token: string) => {
    try {
      // Mock admin verification - in real implementation, verify with API
      const mockAdmin: AdminUser = {
        id: "1",
        email: "admin@ceerion.com",
        role: "super_admin",
        name: "Admin User",
        permissions: [
          "users:read",
          "users:write",
          "quarantine:manage",
          "deliverability:read",
          "policies:write",
          "audit:read",
        ],
      };
      setUser(mockAdmin);
    } catch (error) {
      localStorage.removeItem("admin_token");
      toast.error("Admin session expired");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("admin_token");
    if (token) {
      // Verify admin token and get user info
      verifyAdminToken(token);
    } else {
      setIsLoading(false);
    }
  }, []); // Empty dependency array is fine since we only want this to run once

  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      setIsLoading(true);

      // Mock admin login - in real implementation, call admin login API
      if (email === "admin@ceerion.com" && password === "admin123") {
        const mockToken = "demo-admin-token-" + Date.now();
        localStorage.setItem("admin_token", mockToken);

        const mockAdmin: AdminUser = {
          id: "1",
          email: "admin@ceerion.com",
          role: "super_admin",
          name: "Admin User",
          permissions: [
            "users:read",
            "users:write",
            "quarantine:manage",
            "deliverability:read",
            "policies:write",
            "audit:read",
          ],
        };
        setUser(mockAdmin);
        toast.success("Welcome to CEERION Admin Console");
        return true;
      } else {
        toast.error("Invalid admin credentials");
        return false;
      }
    } catch (error) {
      toast.error("Login failed");
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem("admin_token");
    setUser(null);
    toast.success("Logged out successfully");
  };

  return (
    <AdminAuthContext.Provider
      value={{ user, isLoading, login, logout, client }}
    >
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const context = useContext(AdminAuthContext);
  if (context === undefined) {
    throw new Error("useAdminAuth must be used within an AdminAuthProvider");
  }
  return context;
}
