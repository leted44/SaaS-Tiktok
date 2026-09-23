import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProjectForCarousel } from "@/server/queries";
import { CarouselEditor } from "@/components/carousel/carousel-editor";
import { isAdmin, CREDIT_COSTS } from "@/lib/plans";
import { integrations } from "@/lib/env";
import { carouselStateSchema } from "@/lib/carousel/schema";
import { parseJson } from "@/lib/validations";
import { fallbackSocialCopy, socialCopySchema } from "@/lib/social/captions";

export const dynamic = "force-dynamic";
// Generating now searches and copies a photo for every slide, in parallel —
// still one round trip, but a slow stock host can push it past the default.
export const maxDuration = 60;

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

  const stored = project.carousel
    ? carouselStateSchema.safeParse({ template: project.carousel.template, format: project.carousel.format, handle: project.carousel.handle, slides: project.carousel.slides })
    : null;

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
              hashtags: activeScript.hashtags,
              socialCopy: parseJson(socialCopySchema, activeScript.socialCopy, fallbackSocialCopy({ hook: activeScript.hook, callToAction: activeScript.callToAction, hashtags: activeScript.hashtags })),
            }
          : null
      }
      cost={admin ? 0 : CREDIT_COSTS.CAROUSEL}
      socialCopyCost={admin ? 0 : CREDIT_COSTS.SOCIAL_COPY}
      credits={user.credits}
      aiConfigured={integrations.ai()}
      stockConfigured={integrations.stock()}
    />
  );
}
