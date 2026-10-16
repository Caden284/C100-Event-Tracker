/** Result returned by every server action used with <ActionForm>. */
export type ActionState = { ok: boolean; message?: string; error?: string; at: number; data?: Record<string, unknown> } | null;
