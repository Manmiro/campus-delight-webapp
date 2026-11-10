import { useEffect, useState } from "react";
import { Check, Copy, MapPin, Sparkles, UtensilsCrossed } from "lucide-react";
import { toast } from "sonner";
import logo from "@/assets/logo.webp.asset.json";
import { defaultAvatarFor, isAvatarPath, resolveAvatarUrl } from "@/lib/avatar";
import { Button } from "@/components/ui/button";

type DiningPassProps = {
  fullName: string;
  customerCode: string;
  outletName: string;
  gender?: string | null;
  avatar?: string | null;
};

export function DiningPass({ fullName, customerCode, outletName, gender, avatar }: DiningPassProps) {
  const [resolvedAvatar, setResolvedAvatar] = useState<{ path: string; url: string } | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    setImageFailed(false);
    if (isAvatarPath(avatar)) {
      void resolveAvatarUrl(avatar).then((url) => {
        if (active && url) setResolvedAvatar({ path: avatar, url });
      }).catch(() => { /* Keep the gender-based avatar if the photo is unavailable. */ });
    }
    return () => { active = false; };
  }, [avatar]);

  useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopied(false), 2400);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  const photo = isAvatarPath(avatar)
    ? resolvedAvatar?.path === avatar ? resolvedAvatar.url : null
    : avatar;
  const avatarUrl = imageFailed ? defaultAvatarFor(gender) : photo || defaultAvatarFor(gender);

  async function copyId() {
    try {
      await navigator.clipboard.writeText(customerCode);
      setCopied(true);
      toast.success("Campus Delight ID copied!");
    } catch {
      toast.error("Could not copy your ID. Please select and copy it below.");
    }
  }

  return (
    <section aria-label="Campus Delight dining pass" className="group relative overflow-hidden rounded-2xl border border-golden/40 bg-card text-card-foreground shadow-soft motion-safe:transition-transform motion-safe:duration-300 motion-safe:hover:-translate-y-0.5">
      <div className="h-1.5 bg-gradient-golden" />
      <div className="grid md:grid-cols-[minmax(0,1fr)_minmax(260px,0.7fr)]">
        <div className="min-w-0 p-5 sm:p-6">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <img src={logo.url} alt="" width={40} height={40} decoding="async" className="h-10 w-10 shrink-0 rounded-full" />
              <div className="min-w-0">
                <p className="font-display text-sm font-bold">Campus Delight</p>
                <p className="text-xs text-muted-foreground">Student dining pass</p>
              </div>
            </div>
            <Sparkles aria-hidden="true" className="h-5 w-5 shrink-0 text-golden motion-safe:group-hover:animate-wiggle" />
          </div>
          <div className="flex items-center gap-4">
            <img src={avatarUrl} alt={`${fullName}'s profile`} width={72} height={72} decoding="async" onError={() => setImageFailed(true)} className="h-18 w-18 shrink-0 rounded-2xl border-2 border-golden/40 bg-secondary object-cover" />
            <div className="min-w-0">
              <h2 className="break-words font-display text-lg font-bold">{fullName}</h2>
              <p className="mt-1 flex items-start gap-1.5 text-sm text-muted-foreground"><MapPin aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" /><span className="break-words">{outletName}</span></p>
              <p className="mt-2 text-xs font-semibold text-primary">Good food. Great campus memories.</p>
            </div>
          </div>
        </div>
        <div className="relative flex min-w-0 flex-col justify-center border-t border-dashed border-golden/40 bg-accent/40 p-5 md:border-l md:border-t-0 sm:p-6">
          <div className="mb-2 flex items-center justify-between gap-3 text-xs font-semibold text-muted-foreground"><span>YOUR CAMPUS DELIGHT ID</span><UtensilsCrossed aria-hidden="true" className="h-4 w-4 text-golden" /></div>
          <div className="flex items-center justify-between gap-3">
            <p className="select-all font-mono text-3xl font-bold text-foreground sm:text-4xl">{customerCode}</p>
            <Button type="button" variant="outline" size="icon" disabled={!customerCode} aria-label="Copy Campus Delight ID" title="Copy Campus Delight ID" onClick={() => void copyId()} className="h-11 w-11 shrink-0 border-golden/40 bg-card motion-safe:active:scale-95">
              {copied ? <Check className="text-primary" /> : <Copy />}
            </Button>
          </div>
          <div className="mt-4 flex items-center justify-between gap-3 border-t border-golden/20 pt-3">
            <span className="text-xs font-medium text-muted-foreground">Your seat at the table</span>
            <span role="status" aria-live="polite" className="flex min-h-5 items-center gap-1.5 text-xs font-semibold text-primary">{copied ? <><Check className="h-3.5 w-3.5" /> Copied!</> : <><Sparkles className="h-3.5 w-3.5" /> Campus foodie</>}</span>
          </div>
        </div>
      </div>
    </section>
  );
}