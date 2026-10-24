import { useSuspenseQuery } from "@tanstack/react-query";
import { profileQuery, notificationsQuery } from "@/lib/queries";
import { formatDate, formatDateTime } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/_customer/profile")({
  component: ProfilePage,
  head: () => ({ meta: [{ title: "Profile & Support — Campus Delight" }] }),
});

function ProfilePage() {
  const { data: profile } = useSuspenseQuery(profileQuery);
  const { data: notifs } = useSuspenseQuery(notificationsQuery);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="font-display text-lg">My profile</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <Row label="Full name" value={profile.full_name} />
          <Row label="Email" value={profile.email ?? "—"} />
          <Row label="Phone" value={profile.phone ?? "—"} />
          <Row label="Customer ID" value={profile.customer_code} mono />
          <Row label="Referral code" value={profile.referral_code} mono />
          <Row label="Registered" value={formatDate(profile.created_at)} />
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Verification:</span>
            <Badge variant="outline" className={profile.verification_status === "verified" ? "bg-secondary text-secondary-foreground" : "bg-accent text-accent-foreground"}>
              {profile.verification_status}
            </Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="font-display text-lg">Support & notifications</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Need help? Reach your outlet or email <span className="font-semibold text-foreground">support@campusdelight.com</span>.
          </p>
          <ul className="mt-4 space-y-3">
            {notifs.length === 0 && <p className="text-sm text-muted-foreground">No notifications yet.</p>}
            {notifs.map((n) => (
              <li key={n.id} className="rounded-xl border border-border p-3 text-sm">
                <p className="font-medium">{n.title}</p>
                <p className="text-xs text-muted-foreground">{n.body}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">{formatDateTime(n.created_at)}</p>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-border/60 pb-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={mono ? "font-mono text-xs font-semibold" : "font-medium"}>{value}</span>
    </div>
  );
}
