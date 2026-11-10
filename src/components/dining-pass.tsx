import { useEffect, useState } from "react";
import { MapPin } from "lucide-react";
import { defaultAvatarFor, isAvatarPath, resolveAvatarUrl } from "@/lib/avatar";
import { FoodieIdBadge } from "@/components/foodie-id-badge";

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

  const photo = isAvatarPath(avatar)
    ? resolvedAvatar?.path === avatar ? resolvedAvatar.url : null
    : avatar;
  const avatarUrl = imageFailed ? defaultAvatarFor(gender) : photo || defaultAvatarFor(gender);

  return (
    <section aria-label="Campus Delight dining pass" className="mb-5 flex flex-wrap items-center gap-4">
      <div className="flex min-w-0 basis-52 grow items-center gap-3">
        <img src={avatarUrl} alt={`${fullName}'s profile`} width={56} height={56} decoding="async" onError={() => setImageFailed(true)} className="size-14 shrink-0 rounded-full border-2 border-golden/60 bg-secondary object-cover" />
        <div className="min-w-0">
          <p className="text-xs opacity-80">Welcome back,</p>
          <h2 className="break-words font-display text-lg font-bold">{fullName}</h2>
          <p className="mt-1 flex items-start gap-1.5 text-xs opacity-80"><MapPin aria-hidden="true" className="size-3.5 shrink-0" /><span className="break-words">{outletName}</span></p>
        </div>
      </div>
      <FoodieIdBadge customerCode={customerCode} />
    </section>
  );
}