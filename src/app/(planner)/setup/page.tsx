import { redirect } from "next/navigation";
import { after, connection } from "next/server";

import { SetupScreen } from "@/components/setup/SetupScreen";
import { VoiceDock } from "@/components/voice/VoiceDock";
import { routes } from "@/contracts/routes";
import { dispatchCommand } from "@/server/actions/dispatch";
import { getSession } from "@/server/auth/session";
import { dockFlags, getRenderFlags, prepareSetupRender, recordSetupExposure } from "@/server/flags";

export const metadata = { title: "Set up your wedding · Jashn" };

/**
 * The setup screen (flagsmith 3.4, 5.3; Lane C). Dynamic: it reads the session and evaluates
 * the user's flags once for this render (shared with VoiceDock through the per-render cache).
 * The entry decision picks the arm and logs one line; on row 7 the exposure is scheduled with
 * `after()`, with plain values only. No LiveRefresh, poller or focus refresh here (D79).
 */
export default async function SetupPage() {
  await connection();
  const actor = await getSession();
  if (!actor) redirect(routes.login());

  // On /setup there is no membership: the wedding is "none" and the UI language is the member's.
  const evaluation = await getRenderFlags(actor, null, { ui_language: actor.preferred_language });
  const render = await prepareSetupRender(actor, evaluation);
  const job = render.exposure;
  if (job) after(() => recordSetupExposure(job));

  const dock = dockFlags(evaluation, actor);

  return (
    <SetupScreen
      arm={render.decision.arm}
      voice_available={dock.voice_available}
      setup_opened_at={render.setup_opened_at}
      dispatchCommand={dispatchCommand}
      dock={<VoiceDock wedding_id={null} setup_opened_at={render.setup_opened_at} show_printed_card={false} />}
    />
  );
}
