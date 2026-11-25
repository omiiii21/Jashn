import { handleCancel } from "@/server/voice/cancel";

/** `POST /api/voice/cancel` (voice.md 1.13, 1.17). */
export const dynamic = "force-dynamic";
export const maxDuration = 10;

export async function POST(request: Request) {
  return handleCancel(request);
}
