import { handleReplyAudio } from "@/server/voice/reply-audio";

/** `GET /api/voice/turns/{voice_turn_id}/reply-audio?part={n}` (voice.md 1.14). */
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: Request, context: RouteContext<"/api/voice/turns/[voice_turn_id]/reply-audio">) {
  const { voice_turn_id } = await context.params;
  return handleReplyAudio(request, voice_turn_id);
}
