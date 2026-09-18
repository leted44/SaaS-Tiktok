import { InsufficientCreditsError } from "@/lib/credits";
import { AuthError } from "@/lib/auth";
import { ScriptGenerationError } from "@/lib/ai/script-generator";
import { TTSError } from "@/lib/tts";
import { ZodError } from "zod";

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string; fieldErrors?: Record<string, string> };

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function fail<T = undefined>(error: string, code?: string, fieldErrors?: Record<string, string>): ActionResult<T> {
  return { ok: false, error, code, fieldErrors };
}

/** Wrap a server action so every known failure becomes a typed, user-safe result. */
export async function guard<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return ok(await fn());
  } catch (err) {
    if (err instanceof ZodError) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of err.issues) fieldErrors[String(issue.path[0] ?? "form")] = issue.message;
      return fail("Please check the highlighted fields.", "VALIDATION", fieldErrors);
    }
    if (err instanceof InsufficientCreditsError) return fail(err.message, err.code);
    if (err instanceof AuthError) return fail(err.message, err.code);
    if (err instanceof ScriptGenerationError) return fail(err.message, err.code);
    if (err instanceof TTSError) return fail(err.message, err.code);
    if (err instanceof Error && err.message.startsWith("NEXT_REDIRECT")) throw err;
    console.error("[action]", err);
    return fail(err instanceof Error ? err.message : "Something went wrong. Please try again.", "UNKNOWN");
  }
}
