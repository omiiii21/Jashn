import { Button } from "@/components/ui/button";

type TryDemoButtonProps = {
  /** The `signInDemo` server action from `src/server/auth/actions.ts`, passed in by a server component. */
  action: () => Promise<void>;
  /** True after a demo sign-in failed (`?demo=unavailable`). */
  unavailable?: boolean;
};

/**
 * "Try the demo" on the sign-in and sign-up pages. A plain form posting to a server action, so it
 * works before hydration. It opens a shared sample wedding with fictional people and amounts.
 */
export function TryDemoButton({ action, unavailable = false }: TryDemoButtonProps) {
  return (
    <div className="mt-6 border-t border-line pt-5">
      <form action={action}>
        <Button type="submit" variant="outline" className="h-11 w-full text-body">
          Try the demo: Mira &amp; Kabir&apos;s wedding
        </Button>
      </form>
      <p className="mt-2 text-meta text-ink-3">
        No account needed. It&apos;s a shared sample wedding with fictional people and amounts, so other visitors can
        change it too.
      </p>
      {unavailable ? (
        <p role="alert" className="mt-2 text-meta text-due">
          The demo isn&apos;t available right now. Please try again in a minute.
        </p>
      ) : null}
    </div>
  );
}
