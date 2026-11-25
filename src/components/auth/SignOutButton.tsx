import { Button } from "@/components/ui/button";

type SignOutButtonProps = {
  /** Lane A's `signOut` server action from `src/server/auth/actions.ts`, passed in by a server component. */
  action: () => Promise<void>;
  className?: string;
  variant?: "ghost" | "outline" | "secondary" | "link";
};

/**
 * A sign-out control for the shell's menu (Lane B). Server-safe: a plain form whose action
 * is the server action, so it works before hydration too.
 */
export function SignOutButton({ action, className, variant = "ghost" }: SignOutButtonProps) {
  return (
    <form action={action}>
      <Button type="submit" variant={variant} className={className}>
        Sign out
      </Button>
    </form>
  );
}
