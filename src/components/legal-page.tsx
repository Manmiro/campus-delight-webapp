import { Link } from "@tanstack/react-router";
import { ArrowLeft, Scale, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";

export type PolicySection = { title: string; paragraphs: string[] };

export function LegalLinks() {
  return <nav aria-label="Legal" className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
    <Link to="/privacy" className="hover:text-primary">Privacy Policy</Link>
    <Link to="/terms" className="hover:text-primary">Terms of Service</Link>
  </nav>;
}

export function LegalPage({ kind, sections }: { kind: "privacy" | "terms"; sections: PolicySection[] }) {
  const privacy = kind === "privacy";
  const Icon = privacy ? ShieldCheck : Scale;
  return <div className="min-h-screen bg-canvas">
    <header className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-5 sm:px-6">
      <Link to="/" className="min-w-0"><Logo size="md" /></Link><ThemeToggle />
    </header>
    <main className="mx-auto max-w-5xl px-4 pb-12 sm:px-6">
      <Button asChild variant="ghost" className="mb-6"><Link to="/"><ArrowLeft className="mr-2 h-4 w-4" /> Home</Link></Button>
      <div className="border-b border-border pb-8">
        <Icon className="mb-4 h-9 w-9 text-primary" />
        <p className="text-sm font-semibold text-golden">Campus Delight · Your account, your rights</p>
        <h1 className="mt-2 font-display text-3xl font-bold sm:text-4xl">{privacy ? "Privacy Policy" : "Terms of Service"}</h1>
        <p className="mt-4 max-w-2xl text-muted-foreground">{privacy ? "How we handle information when you order meals, manage your wallet and use Campus Delight." : "The conditions for using Campus Delight’s meals, subscriptions, wallet, tokens and food credit."}</p>
        <p className="mt-5 border-l-4 border-golden bg-golden/10 p-4 text-sm leading-relaxed">Sample draft · prepared 25 October 2026. Not a final legal policy or legal advice. Business details and legal approval are required before this version takes effect.</p>
      </div>
      <div className="grid gap-8 py-8 md:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label="On this page" className="self-start md:sticky md:top-6">
          <p className="mb-3 text-sm font-semibold">On this page</p>
          <ol className="space-y-2 text-sm text-muted-foreground">{sections.map((s, i) => <li key={s.title}><a href={`#section-${i}`} className="hover:text-primary">{i + 1}. {s.title}</a></li>)}</ol>
        </nav>
        <article className="min-w-0 space-y-8">{sections.map((s, i) => <section key={s.title} id={`section-${i}`} className="scroll-mt-6">
          <h2 className="font-display text-xl font-semibold">{i + 1}. {s.title}</h2>
          {s.paragraphs.map(p => <p key={p} className="mt-3 break-words text-sm leading-7 text-muted-foreground">{p}</p>)}
        </section>)}</article>
      </div>
      <footer className="border-t border-border pt-6"><LegalLinks /></footer>
    </main>
  </div>;
}