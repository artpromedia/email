import { createContext, useContext, useState, ReactNode } from "react";

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
}

const AdminAuthContext = createContext<AdminAuthContextType | undefined>(
  undefined,
);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>({
    id: "1",
    email: "admin@ceerion.com",
    role: "super_admin",
    name: "Admin User",
    permissions: ["all"],
  });
  const [isLoading, setIsLoading] = useState(false);

  const login = async (email: string, password: string): Promise<boolean> => {
    if (email === "admin@ceerion.com" && password === "admin123") {
      setUser({
        id: "1",
        email: "admin@ceerion.com",
        role: "super_admin",
        name: "Admin User",
        permissions: ["all"],
      });
      return true;
    }
    return false;
  };

  const logout = () => {
    setUser(null);
  };

  return (
    <AdminAuthContext.Provider value={{ user, isLoading, login, logout }}>
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
