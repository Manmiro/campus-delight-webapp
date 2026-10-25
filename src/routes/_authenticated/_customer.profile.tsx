import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useRef, useState } from "react";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Camera, Loader2, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { profileQuery, notificationsQuery } from "@/lib/queries";
import { formatDate, formatDateTime } from "@/lib/format";
import { defaultAvatarFor, isAvatarPath, resolveAvatarUrl } from "@/lib/avatar";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LegalLinks } from "@/components/legal-page";

export const Route = createFileRoute("/_authenticated/_customer/profile")({
  component: ProfilePage,
  head: () => ({ meta: [{"title": "Profile & Support — Campus Delight"}, {"name": "description", "content": "View and edit your Campus Delight customer details, profile picture, outlet account and notifications."}, {"property": "og:title", "content": "Profile & Support — Campus Delight"}, {"property": "og:description", "content": "View and edit your Campus Delight customer details, profile picture and notifications."}, {"property": "og:type", "content": "website"}, {"name": "twitter:card", "content": "summary"}] }),
});

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

function ProfilePage() {
  const { data: profile } = useSuspenseQuery(profileQuery);
  const { data: notifs } = useSuspenseQuery(notificationsQuery);
  const queryClient = useQueryClient();

  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fullName, setFullName] = useState(profile.full_name);
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [gender, setGender] = useState(profile.gender ?? "");
  const [dob, setDob] = useState(profile.date_of_birth ?? "");
  const fileInput = useRef<HTMLInputElement>(null);

  // Fresh signed link each visit; the bucket is private.
  useEffect(() => {
    let cancelled = false;
    if (isAvatarPath(profile.avatar_url)) {
      resolveAvatarUrl(profile.avatar_url).then((url) => {
        if (!cancelled) setAvatarUrl(url);
      });
    } else {
      setAvatarUrl(profile.avatar_url);
    }
    return () => { cancelled = true; };
  }, [profile.avatar_url]);

  const shownAvatar = avatarUrl ?? defaultAvatarFor(profile.gender);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["me", "profile"] });

  const changePhoto = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Choose an image file (JPG or PNG)");
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      toast.error("Picture is too large — keep it under 5 MB");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
      const path = `${profile.id}/avatar-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("avatars").upload(path, file, { contentType: file.type });
      if (error) throw new Error(error.message);
      const previous = profile.avatar_url;
      if (isAvatarPath(previous)) {
        await supabase.storage.from("avatars").remove([previous]);
      }
      const { error: updateError } = await supabase.from("profiles").update({ avatar_url: path }).eq("id", profile.id);
      if (updateError) throw new Error(updateError.message);
      await invalidate();
      toast.success("Profile picture updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update picture");
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = async () => {
    setUploading(true);
    try {
      const previous = profile.avatar_url;
      if (isAvatarPath(previous)) {
        await supabase.storage.from("avatars").remove([previous]);
      }
      const { error } = await supabase.from("profiles").update({ avatar_url: null }).eq("id", profile.id);
      if (error) throw new Error(error.message);
      setAvatarUrl(null);
      await invalidate();
      toast.success("Profile picture removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove picture");
    } finally {
      setUploading(false);
    }
  };

  const saveDetails = async () => {
    if (!fullName.trim()) {
      toast.error("Full name is required");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from("profiles").update({
        full_name: fullName.trim(),
        phone: phone.trim() || null,
        gender: gender || null,
        date_of_birth: dob || null,
      }).eq("id", profile.id);
      if (error) throw new Error(error.message);
      setEditing(false);
      await invalidate();
      toast.success("Profile updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save changes");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="font-display text-lg">My profile</CardTitle></CardHeader>
        <CardContent className="space-y-5 text-sm">
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative">
              <img
                src={shownAvatar}
                alt="Your profile picture"
                className="h-24 w-24 rounded-full border border-border bg-muted object-cover"
              />
              <button
                type="button"
                className="absolute -bottom-1 -right-1 grid h-9 w-9 place-items-center rounded-full bg-primary text-primary-foreground shadow-sm transition-transform hover:scale-105 disabled:opacity-60"
                aria-label={uploading ? "Updating picture" : "Change profile picture"}
                disabled={uploading}
                onClick={() => fileInput.current?.click()}
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
              </button>
            </div>
            <div className="min-w-0">
              <p className="font-display text-lg font-bold break-words">{profile.full_name}</p>
              <p className="font-mono text-xs text-muted-foreground">{profile.customer_code}</p>
              <p className="mt-1 text-xs text-muted-foreground">{profile.outlet?.name ?? "No outlet yet"}</p>
            </div>
            {isAvatarPath(profile.avatar_url) && (
              <Button variant="ghost" size="sm" className="ml-auto rounded-xl text-muted-foreground" disabled={uploading} onClick={removePhoto}>
                <Trash2 className="mr-1.5 h-4 w-4" /> Remove
              </Button>
            )}
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void changePhoto(file);
            }}
          />

          {editing ? (
            <div className="space-y-4 border-t border-border/60 pt-4">
              <div className="grid gap-2">
                <Label htmlFor="full-name">Full name</Label>
                <Input id="full-name" value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={120} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="phone">Phone number</Label>
                <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" maxLength={20} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="edit-gender">Gender</Label>
                  <Select value={gender} onValueChange={setGender}>
                    <SelectTrigger id="edit-gender" className="w-full">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="dob">Date of birth</Label>
                  <Input id="dob" type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Email and your Campus Delight IDs can't be changed here.</p>
              <div className="flex gap-2">
                <Button onClick={saveDetails} disabled={saving}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save changes
                </Button>
                <Button variant="outline" onClick={() => {
                  setEditing(false);
                  setFullName(profile.full_name);
                  setPhone(profile.phone ?? "");
                  setGender(profile.gender ?? "");
                  setDob(profile.date_of_birth ?? "");
                }} disabled={saving}>Cancel</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3 border-t border-border/60 pt-4">
              <Row label="Full name" value={profile.full_name} />
              <Row label="Email" value={profile.email ?? "—"} />
              <Row label="Phone" value={profile.phone ?? "—"} />
              <Row label="Gender" value={profile.gender ? profile.gender.charAt(0).toUpperCase() + profile.gender.slice(1) : "—"} />
              <Row label="Date of birth" value={profile.date_of_birth ? formatDate(profile.date_of_birth) : "—"} />
              <Row label="Referral code" value={profile.referral_code} mono />
              <Row label="Registered" value={formatDate(profile.created_at)} />
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Verification:</span>
                <Badge variant="outline" className={profile.verification_status === "verified" ? "bg-secondary text-secondary-foreground" : "bg-accent text-accent-foreground"}>
                  {profile.verification_status}
                </Badge>
              </div>
              <Button variant="outline" className="rounded-2xl" onClick={() => setEditing(true)}>
                <Pencil className="mr-2 h-4 w-4" /> Edit details
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="font-display text-lg">Support & notifications</CardTitle></CardHeader>
        <CardContent>
          <div className="mb-4"><LegalLinks /></div>
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
    <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3 border-b border-border/60 pb-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={mono ? "min-w-0 break-all text-right font-mono text-xs font-semibold" : "min-w-0 break-words text-right font-medium"}>{value}</span>
    </div>
  );
}
