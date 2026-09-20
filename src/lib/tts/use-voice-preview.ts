"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

/**
 * Plays a short TTS sample for a voice, shared by the studio panel and the voice
 * catalog. Samples are cached per voice/text/speed for the life of the page so
 * re-auditioning a voice costs nothing.
 *
 * Previews are deliberately available for premium voices too: hearing a locked
 * voice is what makes someone upgrade to it.
 */
export function useVoicePreview(text: string, speed = 1) {
  const [playing, setPlaying] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const cache = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    const urls = cache.current;
    return () => {
      audioRef.current?.pause();
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, []);

  const stop = useCallback(() => {
    audioRef.current?.pause();
    setPlaying(null);
  }, []);

  const toggle = useCallback(
    async (voiceId: string) => {
      if (playing === voiceId) return stop();
      audioRef.current?.pause();

      const key = `${voiceId}:${speed}:${text}`;
      let url = cache.current.get(key);
      if (!url) {
        setLoadingId(voiceId);
        try {
          const res = await fetch("/api/voice/preview", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ voiceId, text, speed }),
          });
          if (!res.ok) {
            const body = (await res.json().catch(() => ({}))) as { error?: string };
            toast.error(body.error ?? "Échec de l'aperçu");
            return;
          }
          if (res.headers.get("x-tts-provider") === "offline") {
            toast.info("Synthèse vocale non configurée — lecture d'un espace réservé silencieux.");
          }
          url = URL.createObjectURL(await res.blob());
          cache.current.set(key, url);
        } finally {
          setLoadingId(null);
        }
      }

      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => setPlaying((p) => (p === voiceId ? null : p));
      await audio.play().catch(() => undefined);
      setPlaying(voiceId);
    },
    [playing, speed, stop, text],
  );

  return { playing, loadingId, toggle, stop };
}
