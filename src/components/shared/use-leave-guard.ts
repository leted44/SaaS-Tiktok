"use client";

import { useEffect } from "react";

/**
 * Keeps unsaved work from vanishing when the page is left.
 *
 * `unload`: a reload or a closed tab makes the browser ask first (its own
 * wording; browsers no longer show a custom one). `links`: a tap on a link to
 * another page of the app asks with this message, and stays put on "Annuler".
 * The listener runs in the capture phase on the document, before Next's Link
 * handler, so a cancelled tap never starts the navigation.
 */
export function useLeaveGuard({ unload, links }: { unload: boolean; links: string | null }) {
  useEffect(() => {
    if (!unload) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unload]);

  useEffect(() => {
    if (!links) return;
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]");
      if (!(a instanceof HTMLAnchorElement) || a.target === "_blank" || a.hasAttribute("download")) return;
      const to = new URL(a.href, window.location.href);
      if (to.origin !== window.location.origin || (to.pathname === window.location.pathname && to.search === window.location.search)) return;
      if (window.confirm(links)) return;
      e.preventDefault();
      e.stopPropagation();
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [links]);
}
