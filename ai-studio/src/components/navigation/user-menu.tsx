"use client";

import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { LogOut, Settings, User2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createClient } from "@/lib/supabase-browser";

interface UserMenuProps {
  user: User;
}

const UserMenu = ({ user }: UserMenuProps) => {
  const router = useRouter();
  const supabase = createClient();

  const avatarUrl = typeof user.user_metadata?.avatar_url === "string" ? user.user_metadata.avatar_url : undefined;
  const fullNameInitials = ((user.user_metadata?.full_name as string | undefined)?.split(" ") ?? [])
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  const initials = fullNameInitials.slice(0, 2) || user.email?.slice(0, 2).toUpperCase() || (user.id ?? "US").slice(0, 2).toUpperCase();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.replace("/login");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <Avatar className="size-9">
          {avatarUrl ? <AvatarImage src={avatarUrl} alt={user.email ?? "User avatar"} /> : null}
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end">
        <DropdownMenuLabel className="text-xs">
          <div className="flex flex-col">
            <span className="text-sm font-semibold">{user.email}</span>
            <span className="text-xs text-muted-foreground">Signed in</span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => router.push("/settings")}>
          <Settings className="size-4" />
          Settings
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => router.push("/dashboard")}>
          <User2 className="size-4" />
          Dashboard
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={handleSignOut}>
          <LogOut className="size-4" />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export { UserMenu };

