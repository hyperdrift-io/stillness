// GET /health — the liveness probe the fleet's Waku apps share. It answers from
// the running process and touches nothing else.
export const GET = (): Response => Response.json({ ok: true });
