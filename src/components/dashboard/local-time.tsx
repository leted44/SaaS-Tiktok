"use client";

import { useEffect, useState } from "react";

const fmt = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** A date in the viewer's own time zone — only known in the browser, so it appears once mounted. */
export function LocalTime({ iso }: { iso: string }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => setText(fmt.format(new Date(iso))), [iso]);
  return <time dateTime={iso}>{text ?? "…"}</time>;
}
