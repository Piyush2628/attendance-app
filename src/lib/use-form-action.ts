"use client";

import { useActionState, useTransition, type FormEvent } from "react";

/**
 * useActionState, but submitted via onSubmit so React does not reset the
 * form's fields after the action runs. A validation error then keeps what the
 * user typed (important on phones, where re-typing is slow).
 */
export function useFormAction<S>(action: (state: Awaited<S>, formData: FormData) => Promise<S>, initial: Awaited<S>) {
  const [state, dispatch, pending] = useActionState<S, FormData>(action, initial);
  const [, startTransition] = useTransition();
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(() => dispatch(formData));
  };
  return [state, onSubmit, pending] as const;
}
