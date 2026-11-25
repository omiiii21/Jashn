import { handleConfirm } from "@/server/voice/confirm";

/** `POST /api/voice/confirm` (voice.md 1.13, 1.17). */
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: Request) {
  return handleConfirm(request);
}
