import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { createCeerionMailClient } from "@ceerion/sdk";
import { toast } from "react-hot-toast";

interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  client: ReturnType<typeof createCeerionMailClient>;
  login: (
    email: string,
    password: string,
    rememberMe?: boolean,
  ) => Promise<boolean>;
  logout: () => void;
  refreshToken: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Create SDK client instance
  const client = createCeerionMailClient({
    baseUrl: "http://localhost:4000",
    headers: {
      // Authorization header will be added automatically via interceptor
    },
  });

  // Setup token interceptor
  useEffect(() => {
    // Add authorization header to all requests
    client.client.use({
      onRequest({ request }) {
        const token = localStorage.getItem("auth-token");
        if (token) {
          request.headers.set("Authorization", `Bearer ${token}`);
        }
        return request;
      },
    });
  }, [client]);

  useEffect(() => {
    // Clear any potentially corrupted auth state on startup in development
    if (process.env.NODE_ENV === "development") {
      const token = localStorage.getItem("auth-token");
      if (token && token.includes("demo-token")) {
        console.log("🧹 Clearing demo auth state for fresh start");
        localStorage.removeItem("auth-token");
        localStorage.removeItem("user-data");
      }
    }

    // Check for existing session and validate token
    const token = localStorage.getItem("auth-token");
    const userData = localStorage.getItem("user-data");

    if (token && userData) {
      try {
        setUser(JSON.parse(userData));
        // Optionally validate token with refresh call
        refreshToken().catch(() => {
          // Token invalid, clear storage
          localStorage.removeItem("auth-token");
          localStorage.removeItem("user-data");
          setUser(null);
        });
      } catch {
        localStorage.removeItem("auth-token");
        localStorage.removeItem("user-data");
      }
    }

    setIsLoading(false);
  }, []);

  const login = async (
    email: string,
    password: string,
    rememberMe: boolean = false,
  ): Promise<boolean> => {
    try {
      setIsLoading(true);
      console.log("🔐 Login attempt:", { email, password: "***", rememberMe });

      // Check for demo credentials first
      if (email === "demo@ceerion.com" && password === "demo") {
        console.log("✅ Demo credentials detected, logging in...");
        const demoUser = {
          id: "1",
          email: "demo@ceerion.com",
          name: "Demo User",
        };

        localStorage.setItem(
          "auth-token",
          "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIiwiZW1haWwiOiJkZW1vQGNlZXJpb24uY29tIiwibmFtZSI6IkRlbW8gVXNlciIsImlhdCI6MTY5MzQ0NDgwMCwiZXhwIjoxNjkzNDQ4NDAwLCJqdGkiOiJkZW1vLXRva2VuIn0.demo",
        );
        localStorage.setItem("user-data", JSON.stringify(demoUser));
        setUser(demoUser);

        toast.success(`Welcome back, ${demoUser.name}!`);
        return true;
      }

      // Use the SDK to login for other credentials
      console.log("� Calling API login...");
      const { data, error } = await client.auth.login({
        email,
        password,
        rememberMe,
      });

      console.log("📡 API response:", { data: !!data, error });

      if (data && !error) {
        const userData = {
          id: data.user.id,
          email: data.user.email,
          name: data.user.name,
        };

        setUser(userData);
        localStorage.setItem("auth-token", data.accessToken);
        localStorage.setItem("user-data", JSON.stringify(userData));

        toast.success(`Welcome back, ${userData.name}!`);
        return true;
      }

      console.log("❌ API login failed");
      toast.error("Invalid email or password");
      return false;
    } catch (error) {
      console.error("❌ Login error:", error);
      toast.error("Login failed. Please try again.");
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const refreshToken = async (): Promise<boolean> => {
    try {
      const { data, error } = await client.auth.refresh();

      if (data && !error) {
        localStorage.setItem("auth-token", data.accessToken);
        return true;
      }

      return false;
    } catch (error) {
      console.error("Token refresh error:", error);
      return false;
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem("auth-token");
    localStorage.removeItem("refresh-token");
    localStorage.removeItem("user-data");
    toast.success("Logged out successfully");
  };

  const value = {
    user,
    isAuthenticated: !!user,
    isLoading,
    client,
    login,
    logout,
    refreshToken,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
