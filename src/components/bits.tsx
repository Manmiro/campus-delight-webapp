import type { ReactNode } from "react";
import { Loader2, Inbox } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { statusLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

export function PageLoader({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center py-20 text-muted-foreground">
      <Loader2 className="mr-2 h-5 w-5 animate-spin" /> {label}
    </div>
  );
}

export function EmptyState({ title, hint, children }: { title: string; hint?: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-border py-14 text-center">
      <Inbox className="mx-auto h-8 w-8 text-muted-foreground/60" />
      <p className="mt-3 font-semibold">{title}</p>
      {hint && <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{hint}</p>}
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}

const statusTone: Record<string, string> = {
  active: "bg-secondary text-secondary-foreground",
  confirmed: "bg-secondary text-secondary-foreground",
  fulfilled: "bg-secondary text-secondary-foreground",
  success: "bg-secondary text-secondary-foreground",
  fully_repaid_on_time: "bg-secondary text-secondary-foreground",
  approved: "bg-secondary text-secondary-foreground",
  completed: "bg-secondary text-secondary-foreground",
  submitted: "bg-accent text-accent-foreground",
  awaiting_payment: "bg-accent text-accent-foreground",
  partially_repaid: "bg-accent text-accent-foreground",
  under_review: "bg-accent text-accent-foreground",
  renewal_pending: "bg-accent text-accent-foreground",
  locked: "bg-accent text-accent-foreground",
  qualified: "bg-accent text-accent-foreground",
  overdue: "bg-destructive/10 text-destructive",
  fully_repaid_late: "bg-destructive/10 text-destructive",
  failed: "bg-destructive/10 text-destructive",
  rejected: "bg-destructive/10 text-destructive",
  cancelled: "bg-destructive/10 text-destructive",
  expired: "bg-destructive/10 text-destructive",
  suspended: "bg-destructive/10 text-destructive",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={cn("border-transparent font-semibold", statusTone[status] ?? "bg-muted text-muted-foreground")}>
      {statusLabel(status)}
    </Badge>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{label}</p>
          {icon}
        </div>
        <p className="mt-1 font-display text-2xl font-bold tracking-tight">{value}</p>
        {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}
