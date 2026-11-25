import { handleTurn } from "@/server/voice/turn";

/** `POST /api/voice/turn` (voice.md 1.4, 1.5, 1.17): multipart in, an NDJSON stream out. */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  return handleTurn(request);
}
