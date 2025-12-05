export const dynamic = "force-dynamic";
import { ReactNode } from "react";
import { redirect } from "next/navigation";
import { createServer } from "@/lib/supabase-server";
import { AuthHeader } from "@/components/navigation/auth-header";
import { TutorialProvider } from "@/components/tutorial/tutorial-provider";
import { Toaster } from "@/hooks/use-toast";

interface ProtectedLayoutProps {
  children: ReactNode;
}

const ProtectedLayout = async ({ children }: ProtectedLayoutProps) => {
  const supabase = await createServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <TutorialProvider>
      <div className="min-h-screen bg-background">
        <AuthHeader user={user} />
        <main className="w-full px-6 py-8">
          {children}
        </main>
        <Toaster />
      </div>
    </TutorialProvider>
  );
};

export default ProtectedLayout;


