import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { LogOut, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export type NavItem = { to: string; label: string; icon: ReactNode; exact?: boolean };

export function Logo({ size = "sm" }: { size?: "sm" | "md" }) {
  return (
    <span className="flex items-center gap-2">
      <span className={`grid place-items-center rounded-xl bg-primary font-display font-bold text-primary-foreground ${size === "sm" ? "h-8 w-8 text-sm" : "h-10 w-10 text-lg"}`}>
        CD
      </span>
      <span className={`font-display font-bold tracking-tight ${size === "sm" ? "text-sm" : "text-lg"}`}>Campus Delight</span>
    </span>
  );
}

async function signOut(queryClient: ReturnType<typeof useQueryClient>, navigate: () => void) {
  await queryClient.cancelQueries();
  queryClient.clear();
  await supabase.auth.signOut();
  navigate();
}

export function AppShell({
  nav,
  title,
  subtitle,
  children,
}: {
  nav: NavItem[];
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const navList = (
    <nav className="space-y-1">
      {nav.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          activeOptions={{ exact: item.exact ?? false }}
          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground [&.active]:bg-secondary [&.active]:text-secondary-foreground [&.active]:font-semibold"
          onClick={() => setOpen(false)}
        >
          {item.icon}
          {item.label}
        </Link>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile top bar */}
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-border bg-background/95 px-4 py-3 backdrop-blur lg:hidden">
        <Logo />
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon" aria-label="Open menu">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-4">
            <SheetTitle>
              <Logo size="md" />
            </SheetTitle>
            <div className="mt-6">{navList}</div>
            <Button
              variant="outline"
              className="mt-6 w-full"
              onClick={() => void signOut(queryClient, () => navigate({ to: "/auth", replace: true }))}
            >
              <LogOut className="mr-2 h-4 w-4" /> Sign out
            </Button>
          </SheetContent>
        </Sheet>
      </header>

      <div className="mx-auto flex max-w-7xl">
        {/* Desktop sidebar */}
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-border bg-sidebar p-4 lg:flex">
          <div className="px-2 py-3">
            <Logo size="md" />
          </div>
          <div className="mt-4 flex-1 overflow-y-auto">{navList}</div>
          <Button
            variant="outline"
            onClick={() => void signOut(queryClient, () => navigate({ to: "/auth", replace: true }))}
          >
            <LogOut className="mr-2 h-4 w-4" /> Sign out
          </Button>
        </aside>

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mb-6">
            <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
            {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}

export { cn };
