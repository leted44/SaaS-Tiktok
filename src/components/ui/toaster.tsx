"use client";

import { Toaster as Sonner } from "sonner";

export function Toaster() {
  return (
    <Sonner
      theme="dark"
      position="bottom-right"
      closeButton
      toastOptions={{
        classNames: {
          toast: "!bg-card !border-white/[0.08] !text-foreground !shadow-2xl !rounded-xl",
          description: "!text-muted-foreground",
          actionButton: "!bg-primary !text-primary-foreground",
          success: "[&>svg]:!text-emerald-400",
          error: "[&>svg]:!text-red-400",
        },
      }}
    />
  );
}
