/**
 * Seed a demo account so the studio is explorable immediately.
 *   npm run db:seed
 * Login: demo@vidisprint.com / demo1234
 */
import { config } from "dotenv";
config({ path: ".env" });
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = "demo@vidisprint.com";
  const passwordHash = await bcrypt.hash("demo1234", 12);
  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name: "Demo Creator", passwordHash, plan: "CREATOR", subscriptionStatus: "ACTIVE", credits: 400, lifetimeCredits: 400 },
  });

  const workspace = await prisma.workspace.upsert({
    where: { slug: "demo-studio" },
    update: {},
    create: { ownerId: user.id, name: "Demo Studio", slug: "demo-studio", primaryColor: "#7C3AED", accentColor: "#F59E0B", captionPreset: "hormozi", defaultVoiceId: "adam", toneOfVoice: "Direct, punchy, zero fluff.", targetAudience: "Ambitious 20-35 y/o creators and founders." },
  });

  const existingTx = await prisma.creditTransaction.findFirst({ where: { userId: user.id } });
  if (!existingTx) {
    await prisma.creditTransaction.create({ data: { userId: user.id, type: "SUBSCRIPTION_GRANT", amount: 400, balanceAfter: 400, description: "Monthly plan credits (400)" } });
  }

  const existingProject = await prisma.project.findFirst({ where: { userId: user.id } });
  if (!existingProject) {
    const project = await prisma.project.create({
      data: { userId: user.id, workspaceId: workspace.id, title: "The 3-second rule for viral hooks", topic: "Why the first 3 seconds decide if a short goes viral", niche: "Marketing", status: "SCRIPTED", voiceId: "adam", targetDurationSec: 40 },
    });
    const scenes = [
      { id: "s1", text: "TikTok decides whether to push your video in the first 3 seconds. Not 10. Three.", visualDescription: "Phone screen with a rapidly scrolling feed, freeze on a video", brollQuery: "phone scrolling feed", durationSec: 5, emphasis: ["3 seconds"], onScreenText: "3 SECONDS" },
      { id: "s2", text: "So if your hook starts with 'hey guys', you've already lost. Nobody's waiting for context.", visualDescription: "Creator waving at camera, red X overlay", brollQuery: "creator waving camera", durationSec: 5, emphasis: ["lost"], onScreenText: null },
      { id: "s3", text: "Instead, open with the payoff. Say the result first, then explain how you got it.", visualDescription: "Before/after split screen", brollQuery: "before after transformation", durationSec: 5, emphasis: ["payoff"], onScreenText: "RESULT FIRST" },
      { id: "s4", text: "Try it on your next 3 videos and watch your average view duration jump.", visualDescription: "Analytics graph trending up", brollQuery: "analytics graph growth", durationSec: 4, emphasis: ["jump"], onScreenText: null },
    ];
    const hook = "Your video is dead after 3 seconds — and here's exactly why.";
    const cta = "Follow for one growth tactic a day.";
    const fullText = [hook, ...scenes.map((s) => s.text), cta].join(" ");
    const script = await prisma.script.create({
      data: {
        projectId: project.id, userId: user.id, version: 1, title: "The 3-second rule", hook, scenes, callToAction: cta, fullText,
        hashtags: ["tiktokgrowth", "contentcreator", "viralhooks", "shortform", "marketingtips", "fyp"],
        alternativeHooks: ["Stop saying 'hey guys' — it's costing you views.", "The algorithm judges you in 3 seconds. Here's how to pass.", "I analyzed 500 viral shorts. They all do this in the first 3 seconds."],
        viralityScore: 84, hookScore: 88, retentionScore: 80, clarityScore: 86, scoreRationale: "Specific number in the hook creates a curiosity gap; single-idea structure keeps retention high. Biggest lever: a stronger visual pattern interrupt around scene 3.",
        estimatedDurationSec: 38, wordCount: fullText.split(/\s+/).length, model: "seed",
      },
    });
    await prisma.project.update({ where: { id: project.id }, data: { activeScriptId: script.id } });
  }
  console.log("Seeded demo account → demo@vidisprint.com / demo1234");
}

main().then(() => prisma.$disconnect()).catch((e) => { console.error(e); process.exit(1); });
