import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { LogOut, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import logoImg from "@/assets/logo.jpg";
import { ThemeToggle } from "@/components/theme-toggle";

export type NavItem = { to: string; label: string; icon: ReactNode; exact?: boolean };

export function Logo({ size = "sm" }: { size?: "sm" | "md" }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <img src={logoImg} alt="Campus Delight logo" className={`shrink-0 rounded-full ${size === "sm" ? "h-8 w-8" : "h-10 w-10"}`} />
      <span className={`min-w-0 font-display font-bold ${size === "sm" ? "text-sm" : "text-lg"}`}>Campus Delight</span>
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
          className="group flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition-all hover:bg-secondary hover:text-secondary-foreground [&.active]:bg-primary [&.active]:text-primary-foreground [&.active]:font-semibold [&.active]:shadow-glow"
          onClick={() => setOpen(false)}
        >
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-xl bg-muted group-[.active]:bg-primary-foreground/20">{item.icon}</span>
          <span className="min-w-0">{item.label}</span>
        </Link>
      ))}
    </nav>
  );

  const doSignOut = () => void signOut(queryClient, () => navigate({ to: "/auth", search: {}, replace: true }));

  return (
    <div className="min-h-screen bg-canvas">
      {/* Mobile top bar */}
      <header className="sticky top-0 z-40 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border/60 bg-card/95 px-4 py-3 backdrop-blur lg:hidden">
        <Logo />
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon" className="rounded-xl" aria-label="Open menu">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 max-w-[calc(100vw-2rem)] overflow-y-auto p-4">
            <SheetTitle>
              <Logo size="md" />
            </SheetTitle>
            <div className="mt-6">{navList}</div>
            <Button variant="outline" className="mt-6 w-full rounded-2xl" onClick={doSignOut}>
              <LogOut className="mr-2 h-4 w-4" /> Sign out
            </Button>
          </SheetContent>
        </Sheet>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1440px] gap-4 lg:p-4">
        {/* Desktop sidebar */}
        <aside className="sticky top-4 hidden h-[calc(100dvh-2rem)] w-60 shrink-0 flex-col rounded-3xl bg-card p-4 shadow-soft lg:flex xl:w-64">
          <div className="flex items-center justify-between gap-2 px-2 py-2">
            <Logo size="md" />
            <ThemeToggle />
          </div>
          <div className="mt-5 flex-1 overflow-y-auto pr-1">{navList}</div>
          {nav.some((n) => n.to === "/order") && (<div className="mt-4 rounded-2xl bg-gradient-brand p-4 text-primary-foreground">
            <p className="font-display text-sm font-bold">Hungry?</p>
            <p className="mt-0.5 text-xs opacity-85">Fresh meals from your outlet.</p>
            <Button asChild size="sm" variant="secondary" className="mt-3 w-full rounded-xl">
              <Link to="/order">Order now</Link>
            </Button>
          </div>)}
          <Button variant="ghost" className="mt-2 rounded-2xl text-muted-foreground" onClick={doSignOut}>
            <LogOut className="mr-2 h-4 w-4" /> Sign out
          </Button>
        </aside>

        <main className="app-content min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-2 lg:py-2">
          <div className="mb-6 rounded-3xl bg-card px-5 py-4 shadow-soft sm:px-6">
            <h1 className="font-display text-xl font-bold tracking-tight sm:text-2xl">{title}</h1>
            {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}

export { cn };
