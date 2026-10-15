// Small pure helpers for the console header and the judge access code.

/** The access code is only for the reviewer's own disputes; samples never need it. */
export function needsAccessCode(disputeId: string | null | undefined, own: { dispute_id: string }[]): boolean {
  return !!disputeId && own.some(dispute => dispute.dispute_id === disputeId);
}

export const ACCESS_CODE_HELP = "Needed to run your own disputes on the public demo. Sample disputes don't need it.";
export const ACCESS_CODE_FIELD_ID = "judge-access-code";

/**
 * A resolve that failed because of the code: 401 (wrong code), or 404 for one's own
 * dispute on the public demo (no code, so only samples are allowed). The message then
 * points to the field, which receives focus.
 */
export function accessCodeProblem(error: unknown, isOwn: boolean): boolean {
  // Duck-typed on ApiError's status, so this module stays free of runtime imports.
  const status = (error as { status?: unknown } | null)?.status;
  return isOwn && (status === 401 || status === 404);
}

export function accessCodeMessage(status: number): string {
  return status === 401
    ? "Access code not recognised. Check the Judge access code field above Run agents."
    : "Your own disputes need a judge access code on the public demo. Enter it in the Judge access code field above Run agents.";
}
