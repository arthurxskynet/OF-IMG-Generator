export const dynamic = "force-dynamic";
import { redirect } from "next/navigation";
import { createServer } from "@/lib/supabase-server";

export default async function Home() {
  const supabase = await createServer();
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) redirect("/dashboard");
  redirect("/login");
}
