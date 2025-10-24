import type { User } from "@supabase/supabase-js";
import Link from "next/link";
import { MobileNav } from "@/components/navigation/mobile-nav";
import { NavigationLinks } from "@/components/navigation/navigation-links";
import { UserMenu } from "@/components/navigation/user-menu";
import { ThemeToggle } from "@/components/theme/theme-toggle";

interface AuthHeaderProps {
  user: User;
}

const AuthHeader = ({ user }: AuthHeaderProps) => {
  const displayName = user.user_metadata?.full_name ?? user.email ?? "Account";

  return (
    <header className="sticky top-0 z-40 border-b bg-card/80 text-card-foreground backdrop-blur supports-[backdrop-filter]:bg-card/60">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-6 px-4 sm:px-6">
        <Link href="/dashboard" className="flex items-center gap-3 text-sm font-semibold">
          <span className="rounded-md border border-primary/30 bg-primary/10 px-3 py-1 text-primary">AI Studio</span>
          <span className="hidden text-muted-foreground sm:inline">Welcome back, {displayName}</span>
        </Link>
        <div className="flex items-center gap-3">
          <MobileNav />
          <NavigationLinks />
          <ThemeToggle />
          <UserMenu user={user} />
        </div>
      </div>
    </header>
  );
};

export { AuthHeader };

