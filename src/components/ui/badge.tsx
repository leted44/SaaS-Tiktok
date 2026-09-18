import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide transition-colors", {
  variants: {
    variant: {
      default: "border-primary/30 bg-primary/15 text-brand-200",
      secondary: "border-white/10 bg-white/[0.05] text-muted-foreground",
      success: "border-emerald-500/30 bg-emerald-500/15 text-emerald-300",
      warning: "border-amber-500/30 bg-amber-500/15 text-amber-300",
      destructive: "border-red-500/30 bg-red-500/15 text-red-300",
      info: "border-sky-500/30 bg-sky-500/15 text-sky-300",
      outline: "border-white/15 text-foreground",
      gradient: "border-transparent bg-brand-gradient text-white",
    },
  },
  defaultVariants: { variant: "default" },
});

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

/** Renders a <span> so it is valid inside <p>, <button> and other phrasing content. */
function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
