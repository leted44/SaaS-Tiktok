import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk, JetBrains_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const grotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-display", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: { default: "VidiSprint — Studio vidéo IA pour formats courts", template: "%s · VidiSprint" },
  description: "Transformez n'importe quelle idée en TikTok, Reel ou Short viral. Scripts IA, voix off réalistes, sous-titres dynamiques et publication en un clic.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  openGraph: { title: "VidiSprint", description: "Studio de création vidéo courte propulsé par l'IA.", type: "website" },
};

export const viewport: Viewport = { themeColor: "#0B0714", colorScheme: "dark" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`dark ${inter.variable} ${grotesk.variable} ${mono.variable}`} suppressHydrationWarning>
      <body className="min-h-screen font-sans">
        <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
        <Toaster />
      </body>
    </html>
  );
}
