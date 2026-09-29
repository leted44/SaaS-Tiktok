import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProjectForCarousel } from "@/server/queries";
import { CarouselEditor } from "@/components/carousel/carousel-editor";
import { isAdmin, CREDIT_COSTS } from "@/lib/plans";
import { integrations } from "@/lib/env";
import { carouselStateFromRow } from "@/lib/carousel/schema";
import { parseJson, scenesSchema } from "@/lib/validations";
import { fallbackSocialCopy, socialCopySchema } from "@/lib/social/captions";

export const dynamic = "force-dynamic";
// Server actions from this page include the AI image batch: the cover (up to
// ~55s on the Pro image model) and then every other slide in parallel.
export const maxDuration = 180;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const data = await getProjectForCarousel(id);
  return { title: data ? `${data.project.title} · Carrousel` : "Carrousel" };
}

export default async function CarouselPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getProjectForCarousel(id);
  if (!data) notFound();
  const { project, user, activeScript } = data;
  const admin = isAdmin(user.role);

  const stored = project.carousel ? carouselStateFromRow(project.carousel) : null;

  return (
    <CarouselEditor
      projectId={project.id}
      projectTitle={project.title}
      initial={stored?.success ? { ...stored.data, version: project.carousel!.updatedAt.getTime() } : null}
      brand={{ primary: project.workspace.primaryColor, accent: project.workspace.accentColor }}
      hasScript={Boolean(activeScript)}
      script={
        activeScript
          ? {
              id: activeScript.id,
              title: activeScript.title,
              hook: activeScript.hook,
              scenes: parseJson(scenesSchema, activeScript.scenes, []).map((s) => ({ id: s.id, text: s.text, visualDescription: s.visualDescription, brollQuery: s.brollQuery, onScreenText: s.onScreenText })),
              callToAction: activeScript.callToAction,
              hashtags: activeScript.hashtags,
              socialCopy: parseJson(socialCopySchema, activeScript.socialCopy, fallbackSocialCopy({ hook: activeScript.hook, callToAction: activeScript.callToAction, hashtags: activeScript.hashtags })),
            }
          : null
      }
      cost={admin ? 0 : CREDIT_COSTS.CAROUSEL}
      socialCopyCost={admin ? 0 : CREDIT_COSTS.SOCIAL_COPY}
      aiImageCost={admin ? 0 : CREDIT_COSTS.AI_IMAGE}
      credits={user.credits}
      aiConfigured={integrations.ai()}
      stockConfigured={integrations.stock()}
      aiImagesConfigured={integrations.aiImages()}
      posted={project.postedAt ? { platforms: project.postedPlatforms } : null}
    />
  );
}
