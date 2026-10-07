/**
 * The results loop — screenshot reading, per-post diagnosis, the account's
 * lessons and the reminders to enter numbers — is switched off: every step
 * is a paid Claude call the owner pays, and the owner reads his numbers in
 * a conversation instead. The code and the saved data stay; turning this on
 * brings it all back (button, Leçons page, reminders, lessons in the writers).
 */
export const RESULTS_ENABLED = false;
