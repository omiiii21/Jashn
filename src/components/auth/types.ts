/**
 * The shared shape of the sign-in and sign-up forms' state. Client-safe: the forms import it,
 * and Lane A's server actions in `src/server/auth/actions.ts` return it.
 */
export type AuthFormState = {
  /** One plain message for the whole form, or null. */
  error: string | null;
  /** The email as typed, so the form keeps it after an error. Never the password. */
  email: string;
};

/** A sign-in or sign-up server action, passed to the form as a prop (AGENTS.md rule 4). */
export type AuthFormAction = (state: AuthFormState, form_data: FormData) => Promise<AuthFormState>;

export const INITIAL_AUTH_FORM_STATE: AuthFormState = { error: null, email: "" };
