import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all duration-200 ring-focus disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 active:scale-[0.98]",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-glow-sm hover:bg-brand-500 hover:shadow-glow",
        gradient: "bg-brand-gradient text-white shadow-glow-sm hover:shadow-glow hover:brightness-110",
        secondary: "bg-secondary text-secondary-foreground hover:bg-accent border border-white/[0.06]",
        outline: "border border-white/10 bg-transparent hover:bg-white/[0.04] hover:border-white/20",
        ghost: "hover:bg-white/[0.06] text-muted-foreground hover:text-foreground",
        destructive: "bg-destructive/15 text-red-300 border border-destructive/30 hover:bg-destructive/25",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-12 rounded-xl px-6 text-base",
        xl: "h-14 rounded-xl px-8 text-base",
        icon: "h-9 w-9",
        "icon-sm": "h-7 w-7 rounded-md",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild = false, loading, children, disabled, ...props }, ref) => {
  if (asChild) {
    // Radix Slot requires exactly one element child; spinner/disabled states apply to real buttons only.
    return (
      <Slot className={cn(buttonVariants({ variant, size, className }), (disabled || loading) && "pointer-events-none opacity-50")} ref={ref} {...props}>
        {children}
      </Slot>
    );
  }
  return (
    <button className={cn(buttonVariants({ variant, size, className }))} ref={ref} disabled={disabled || loading} {...props}>
      {loading ? <Loader2 className="animate-spin" /> : null}
      {children}
    </button>
  );
});
Button.displayName = "Button";

export { Button, buttonVariants };
