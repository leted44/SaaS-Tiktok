import { cn } from "@/lib/utils";

export function PlatformIcon({ platform, className }: { platform: "TIKTOK" | "INSTAGRAM" | "YOUTUBE"; className?: string }) {
  const cls = cn("h-4 w-4", className);
  if (platform === "TIKTOK")
    return (
      <svg viewBox="0 0 24 24" className={cls} fill="currentColor" aria-label="TikTok">
        <path d="M19.6 6.7a4.9 4.9 0 0 1-3.8-4.2V2h-3.4v13.4a2.9 2.9 0 1 1-2-2.7V9.2a6.3 6.3 0 1 0 5.4 6.2V8.6a8.2 8.2 0 0 0 4.8 1.5V6.7h-1z" />
      </svg>
    );
  if (platform === "INSTAGRAM")
    return (
      <svg viewBox="0 0 24 24" className={cls} fill="none" stroke="currentColor" strokeWidth="2" aria-label="Instagram">
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.5" cy="6.5" r="1" fill="currentColor" />
      </svg>
    );
  return (
    <svg viewBox="0 0 24 24" className={cls} fill="currentColor" aria-label="YouTube">
      <path d="M23 7.2a3 3 0 0 0-2.1-2.1C19 4.6 12 4.6 12 4.6s-7 0-8.9.5A3 3 0 0 0 1 7.2 31 31 0 0 0 .5 12 31 31 0 0 0 1 16.8a3 3 0 0 0 2.1 2.1c1.9.5 8.9.5 8.9.5s7 0 8.9-.5a3 3 0 0 0 2.1-2.1c.4-1.6.5-3.2.5-4.8s-.1-3.2-.5-4.8zM9.8 15.5v-7l6 3.5-6 3.5z" />
    </svg>
  );
}

export const PLATFORM_LABEL = { TIKTOK: "TikTok", INSTAGRAM: "Instagram Reels", YOUTUBE: "YouTube Shorts" } as const;
