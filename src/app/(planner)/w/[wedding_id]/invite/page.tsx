/**
 * The Invite placeholder under Lane D's path (decision D121). Lane B's nav links here
 * through `routes.invite`. lane-d-publish replaces it with the Invite page that mounts
 * PublishSheet (D107), in the 14:45 batch (D131).
 */
export default function InvitePlaceholderPage() {
  return (
    <section className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-semibold">Invitation</h1>
      <p className="mt-2">The invitation studio is on its way.</p>
    </section>
  );
}
