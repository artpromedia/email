import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { toast } from "react-hot-toast";

// Mock client for now to avoid SDK import issues
const mockClient = {
  // Add mock methods as needed
};

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
  client: any;
}

const AdminAuthContext = createContext<AdminAuthContextType | undefined>(
  undefined,
);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const client = mockClient;

  useEffect(() => {
    const token = localStorage.getItem("admin_token");
    if (token) {
      // Verify admin token and get user info
      verifyAdminToken(token);
    } else {
      setIsLoading(false);
    }
  }, []);

  const verifyAdminToken = async (_token: string) => {
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
  };

  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      setIsLoading(true);

      // Mock authentication - in real implementation, call API
      if (email === "admin@ceerion.com" && password === "admin123") {
        const mockToken = "mock-admin-token-12345";
        localStorage.setItem("admin_token", mockToken);

        const mockAdmin: AdminUser = {
          id: "1",
          email,
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
        toast.success("Logged in successfully!");
        return true;
      } else {
        toast.error("Invalid credentials");
        return false;
      }
    } catch (error) {
      console.error("Login error:", error);
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
      value={{
        user,
        isLoading,
        login,
        logout,
        client,
      }}
    >
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const context = useContext(AdminAuthContext);
  if (!context) {
    throw new Error("useAdminAuth must be used within an AdminAuthProvider");
  }
  return context;
}
