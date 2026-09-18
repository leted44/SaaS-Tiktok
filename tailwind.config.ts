import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

const config: Config = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    container: { center: true, padding: "1.5rem", screens: { "2xl": "1400px" } },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
        popover: { DEFAULT: "hsl(var(--popover))", foreground: "hsl(var(--popover-foreground))" },
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
        success: { DEFAULT: "hsl(var(--success))", foreground: "hsl(var(--success-foreground))" },
        warning: { DEFAULT: "hsl(var(--warning))", foreground: "hsl(var(--warning-foreground))" },
        brand: {
          50: "#f3f0ff", 100: "#e9e3ff", 200: "#d5caff", 300: "#b8a3ff", 400: "#9670ff",
          500: "#7c3aed", 600: "#6d28d9", 700: "#5b21b6", 800: "#4c1d95", 900: "#3b0f7a",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xl: "calc(var(--radius) + 4px)",
        "2xl": "calc(var(--radius) + 8px)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "var(--font-sans)", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        glow: "0 0 0 1px hsl(var(--primary) / 0.25), 0 8px 40px -8px hsl(var(--primary) / 0.45)",
        "glow-sm": "0 0 0 1px hsl(var(--primary) / 0.2), 0 4px 20px -4px hsl(var(--primary) / 0.35)",
        card: "0 1px 0 0 hsl(0 0% 100% / 0.04) inset, 0 8px 32px -12px hsl(0 0% 0% / 0.6)",
      },
      backgroundImage: {
        "grid-fade": "linear-gradient(to right, hsl(0 0% 100% / 0.04) 1px, transparent 1px), linear-gradient(to bottom, hsl(0 0% 100% / 0.04) 1px, transparent 1px)",
        "brand-gradient": "linear-gradient(135deg, #7c3aed 0%, #db2777 50%, #f59e0b 100%)",
        "brand-gradient-soft": "linear-gradient(135deg, hsl(262 83% 58% / 0.25), hsl(330 81% 60% / 0.15), transparent 70%)",
      },
      keyframes: {
        "accordion-down": { from: { height: "0" }, to: { height: "var(--radix-accordion-content-height)" } },
        "accordion-up": { from: { height: "var(--radix-accordion-content-height)" }, to: { height: "0" } },
        shimmer: { "0%": { backgroundPosition: "-700px 0" }, "100%": { backgroundPosition: "700px 0" } },
        "pulse-ring": { "0%": { transform: "scale(0.9)", opacity: "0.8" }, "100%": { transform: "scale(1.6)", opacity: "0" } },
        float: { "0%, 100%": { transform: "translateY(0)" }, "50%": { transform: "translateY(-8px)" } },
        "spin-slow": { from: { transform: "rotate(0deg)" }, to: { transform: "rotate(360deg)" } },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        shimmer: "shimmer 2s linear infinite",
        "pulse-ring": "pulse-ring 1.6s cubic-bezier(0.2, 0.8, 0.2, 1) infinite",
        float: "float 6s ease-in-out infinite",
        "spin-slow": "spin-slow 8s linear infinite",
      },
    },
  },
  plugins: [animate],
};

export default config;
