"use client";

import { UserButton } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { api } from "@/convex/_generated/api";

const LINKS = [
  { href: "/tools", label: "All tools" },
  { href: "/listings", label: "My listings" },
  { href: "/requests", label: "My requests" },
  { href: "/incoming", label: "Incoming requests" },
];

export function AppNav() {
  const pathname = usePathname();
  const me = useQuery(api.users.me);
  // Only hides a link. The admin functions check the role themselves.
  const links =
    me?.role === "admin"
      ? [...LINKS, { href: "/admin", label: "Admin" }]
      : LINKS;

  return (
    <header className="border-b border-zinc-200 bg-white">
      <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3">
        <Link href="/tools" className="font-semibold tracking-tight">
          LendLoop
        </Link>
        <nav className="order-last flex w-full flex-wrap gap-x-4 gap-y-1 text-sm sm:order-none sm:w-auto sm:flex-1">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={pathname === link.href ? "page" : undefined}
              className={
                pathname === link.href
                  ? "font-medium text-zinc-900"
                  : "text-zinc-500 hover:text-zinc-900"
              }
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <UserButton />
      </div>
    </header>
  );
}
