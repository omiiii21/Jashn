"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";

import type { CommandEnvelope, CommandResponse } from "@/contracts/commands";

import { newIdempotencyKey, type Dispatch, type SubmitState } from "./command";

/**
 * One form's submit: a single idempotency key per exact request (made on first use, kept for an
 * identical retry or a double tap, renewed when the body changes, dropped after a success or a
 * `reset`, domain I1), never optimistic, and a
 * `router.refresh()` after a success so every figure comes back from the read models.
 * While a save is in flight a second call returns the same promise.
 */
export function useCommand(dispatch: Dispatch) {
  const router = useRouter();
  const [state, setState] = useState<SubmitState>({ status: "idle" });
  const keyRef = useRef<string | null>(null);
  const bodyRef = useRef<string | null>(null);
  const inFlight = useRef<Promise<CommandResponse> | null>(null);

  const submit = useCallback(
    (envelope: Omit<CommandEnvelope, "idempotency_key">): Promise<CommandResponse> => {
      if (inFlight.current) return inFlight.current;
      const body = JSON.stringify(envelope);
      if (!keyRef.current || bodyRef.current !== body) keyRef.current = newIdempotencyKey();
      bodyRef.current = body;
      const full = { ...envelope, idempotency_key: keyRef.current } as CommandEnvelope;
      setState({ status: "saving" });
      const run = dispatch(full)
        .then((response) => {
          if (response.ok) {
            keyRef.current = null;
            bodyRef.current = null;
            setState({ status: "saved", response });
            router.refresh();
          } else {
            // A refused command wrote nothing; the same key may be reused for the retry.
            setState({ status: "error", error: response.error });
          }
          return response;
        })
        .catch((): CommandResponse => {
          const response: CommandResponse = {
            ok: false,
            error: { code: "internal_error", message: "The connection dropped before the server answered. Try again; nothing is saved twice." },
          };
          setState({ status: "error", error: response.error });
          return response;
        })
        .finally(() => {
          inFlight.current = null;
        });
      inFlight.current = run;
      return run;
    },
    [dispatch, router],
  );

  /** Start a fresh confirmation: a new key next time. */
  const reset = useCallback(() => {
    keyRef.current = null;
    bodyRef.current = null;
    setState({ status: "idle" });
  }, []);

  return { state, submit, reset, saving: state.status === "saving" };
}
