/**
 * What a script becomes: a video, a carousel, or both. Not stored anywhere —
 * a project can always grow the other output later — this only decides the
 * wording and the destination right after creation.
 */
export type ContentFormat = "video" | "carousel" | "both";

/** Where to land right after generating a script or creating a project. */
export function formatDestination(format: ContentFormat, projectId: string): string {
  return format === "carousel" ? `/studio/${projectId}/carousel` : `/studio/${projectId}`;
}
