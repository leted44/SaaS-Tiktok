import { signOut } from "@/lib/auth";

/**
 * Breaks the redirect loop a stale session causes: a signed cookie that
 * still decodes (so it looks "logged in") but whose user id no longer
 * exists in the database — the account was deleted, or the cookie is left
 * over from before a database reset. Without this, the app layout sends
 * that visitor to /sign-in, which sees the same cookie, still thinks
 * they're logged in, and sends them straight back — forever ("too many
 * redirects"). Clearing the cookie here, in a route handler (the app
 * layout itself can't mutate cookies), ends the loop for good.
 */
export async function GET() {
  await signOut({ redirectTo: "/sign-in" });
}
