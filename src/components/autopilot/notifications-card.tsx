"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, BellRing, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { removePushSubscriptionAction, savePushSubscriptionAction, sendTestPushAction } from "@/server/actions/autopilot";

type PushState = "checking" | "unsupported" | "unconfigured" | "denied" | "off" | "on";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function NotificationsCard({ pushKey }: { pushKey: string | null }) {
  const [state, setState] = useState<PushState>("checking");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!pushKey) return setState("unconfigured");
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return setState("unsupported");
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      if (cancelled) return;
      if (sub) {
        // Re-register it with the server: cheap, and repairs a subscription the server lost or another account took.
        void savePushSubscriptionAction(sub.toJSON(), navigator.userAgent);
        setState("on");
      } else setState("off");
    })().catch(() => !cancelled && setState("off"));
    return () => {
      cancelled = true;
    };
  }, [pushKey]);

  async function enable() {
    if (!pushKey) return;
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return setState(permission === "denied" ? "denied" : "off");
      const key = urlBase64ToUint8Array(pushKey);
      let sub = await reg.pushManager.getSubscription();
      // A subscription made with another key (after a server key change) must be replaced.
      if (sub && sub.options.applicationServerKey && btoa(String.fromCharCode(...new Uint8Array(sub.options.applicationServerKey))) !== btoa(String.fromCharCode(...key))) {
        await sub.unsubscribe();
        sub = null;
      }
      sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      const res = await savePushSubscriptionAction(sub.toJSON(), navigator.userAgent);
      if (!res.ok) return toast.error(res.error);
      setState("on");
      toast.success("Notifications activées sur cet appareil.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Impossible d'activer les notifications.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await removePushSubscriptionAction(sub.endpoint);
        await sub.unsubscribe();
      }
      setState("off");
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    const res = await sendTestPushAction();
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    toast.success("Notification envoyée — elle arrive dans quelques secondes.");
  }

  const text: Record<PushState, string> = {
    checking: "Vérification…",
    unsupported: "Ce navigateur ne gère pas les notifications. Sur iPhone, ajoute d'abord l'app à l'écran d'accueil.",
    unconfigured: "Les notifications ne sont pas configurées sur le serveur (AUTH_SECRET manquant).",
    denied: "Les notifications sont bloquées pour ce site. Autorise-les dans les réglages du navigateur, puis recharge la page.",
    off: "Reçois une notification à l'heure prévue, avec ta vidéo prête à partager (WhatsApp, TikTok…), et une alerte si une vidéo échoue.",
    on: "Activées sur cet appareil. Tu seras prévenu à l'heure de chaque livraison, et en cas d'échec.",
  };

  return (
    <div className="surface space-y-3 p-4">
      <div className="flex items-center gap-2">
        {state === "on" ? <BellRing className="h-4 w-4 text-emerald-400" /> : state === "denied" || state === "unsupported" ? <BellOff className="h-4 w-4 text-muted-foreground" /> : <Bell className="h-4 w-4 text-brand-300" />}
        <p className="font-semibold">Notifications</p>
      </div>
      <p className="text-xs text-muted-foreground">{text[state]}</p>
      {state === "off" && <Button variant="secondary" size="sm" className="w-full" loading={busy} onClick={enable}><Bell /> Activer sur ce téléphone</Button>}
      {state === "on" && (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" size="sm" loading={busy} onClick={test}><Send /> Tester</Button>
          <Button variant="ghost" size="sm" disabled={busy} onClick={disable}><BellOff /> Désactiver</Button>
        </div>
      )}
    </div>
  );
}
