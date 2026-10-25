import { supabase } from "@/integrations/supabase/client";
import maleAvatar from "@/assets/avatar-male.png";
import femaleAvatar from "@/assets/avatar-female.png";

/** Default cartoon avatar matching the gender chosen at registration (falls back to male). */
export function defaultAvatarFor(gender?: string | null): string {
  return gender?.toLowerCase() === "female" ? femaleAvatar : maleAvatar;
}

/** Avatar values are storage paths like `<uid>/avatar-<ts>.jpg`; anything else is already a URL. */
export function isAvatarPath(value?: string | null): boolean {
  return !!value && !value.startsWith("http");
}

/** Signed read link for a private avatars-bucket path (1 hour, recreated per page visit). */
export async function resolveAvatarUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from("avatars").createSignedUrl(path, 60 * 60);
  if (error || !data) return null;
  return data.signedUrl;
}
