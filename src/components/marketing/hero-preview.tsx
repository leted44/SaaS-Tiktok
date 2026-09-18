"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Mic2, Captions, Send } from "lucide-react";

const WORDS = ["STOP", "SCROLLING.", "THIS", "ONE", "HABIT", "CHANGED", "EVERYTHING."];

export function HeroPreview() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((v) => (v + 1) % WORDS.length), 420);
    return () => clearInterval(t);
  }, []);
  const page = i < 3 ? WORDS.slice(0, 3) : WORDS.slice(3);
  const activeIndex = i < 3 ? i : i - 3;

  return (
    <div className="relative mx-auto w-full max-w-md">
      <div className="absolute -inset-6 -z-10 rounded-[40px] bg-brand-gradient opacity-30 blur-3xl" />
      <div className="relative aspect-[9/16] w-full overflow-hidden rounded-[36px] border border-white/10 bg-[#0B0714] shadow-2xl">
        <div className="absolute inset-0 bg-[linear-gradient(160deg,#3B0F7A_0%,#0B0714_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.15),transparent_55%)]" />
        <div className="absolute inset-x-0 top-0 flex items-center justify-between p-5 text-[10px] text-white/60">
          <span>9:41</span>
          <span className="rounded-full bg-black/40 px-2 py-0.5">1080p · 30fps</span>
        </div>
        <div className="absolute inset-0 flex items-center justify-center px-6">
          <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-center font-display text-4xl font-black uppercase leading-tight text-white [text-shadow:0_4px_16px_rgba(0,0,0,0.6)]">
            {page.map((w, idx) => (
              <motion.span
                key={`${w}-${idx}-${i < 3 ? "a" : "b"}`}
                animate={{ scale: idx === activeIndex ? 1.12 : 1, color: idx === activeIndex ? "#F59E0B" : "#FFFFFF" }}
                transition={{ type: "spring", stiffness: 300, damping: 16 }}
              >
                {w}
              </motion.span>
            ))}
          </div>
        </div>
        <div className="absolute inset-x-0 bottom-0 p-5">
          <div className="h-1 w-full rounded-full bg-white/15">
            <motion.div className="h-1 rounded-full bg-primary" animate={{ width: `${((i + 1) / WORDS.length) * 100}%` }} transition={{ ease: "linear", duration: 0.4 }} />
          </div>
        </div>
      </div>

      {/* floating chips */}
      <AnimatePresence>
        {[
          { icon: Sparkles, label: "Virality 87", pos: "-left-10 top-16", delay: 0.4 },
          { icon: Mic2, label: "Voice: Adam", pos: "-right-8 top-40", delay: 0.6 },
          { icon: Captions, label: "Hormozi captions", pos: "-left-12 bottom-40", delay: 0.8 },
          { icon: Send, label: "Scheduled ×3", pos: "-right-6 bottom-16", delay: 1 },
        ].map((c) => (
          <motion.div
            key={c.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: [0, -6, 0] }}
            transition={{ delay: c.delay, duration: 4, repeat: Infinity, repeatType: "mirror" }}
            className={`glass-strong absolute ${c.pos} hidden items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium shadow-xl md:flex`}
          >
            <c.icon className="h-3.5 w-3.5 text-brand-300" /> {c.label}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
