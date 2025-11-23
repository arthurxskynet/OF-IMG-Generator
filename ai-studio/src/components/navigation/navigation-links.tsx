"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAdmin } from "@/hooks/use-admin";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/variants", label: "Variants" },
  { href: "/settings", label: "Settings" },
  { href: "/models", label: "Models" },
];

const adminLinks = [
  { href: "/admin", label: "Admin" },
  { href: "/admin/storage", label: "Storage" },
];

const NavigationLinks = () => {
  const pathname = usePathname();
  const { isAdmin, loading } = useAdmin();

  const allLinks = [
    ...links,
    ...(isAdmin && !loading ? adminLinks : [])
  ];

  return (
    <nav className="hidden items-center gap-1 text-sm font-medium sm:flex">
      {allLinks.map((link) => {
        const isActive = pathname === link.href || pathname.startsWith(link.href + '/');

        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "rounded-full px-4 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              isActive
                ? "bg-primary/15 text-primary dark:bg-primary/25"
                : "text-muted-foreground hover:text-foreground hover:bg-accent"
            )}
            aria-current={isActive ? "page" : undefined}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
};

export { NavigationLinks };

