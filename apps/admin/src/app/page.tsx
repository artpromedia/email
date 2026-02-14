import { redirect } from "next/navigation";

/**
 * Root page redirects to the admin dashboard.
 * All admin functionality lives under /admin with its own layout.
 */
export default function RootPage() {
  redirect("/admin");
}
