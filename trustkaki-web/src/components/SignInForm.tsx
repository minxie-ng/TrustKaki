"use client";

import { useState } from "react";

interface SignInFormProps {
  onSignIn: (email: string, password: string) => Promise<void>;
  disabled?: boolean;
  error?: string | null;
}

export default function SignInForm({
  onSignIn,
  disabled = false,
  error = null,
}: SignInFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSignIn(email, password);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--care-paper)] p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-lg border border-gray-200 border-t-4 border-t-[var(--care-brand)] bg-white p-6 shadow-sm"
      >
        <div className="text-sm font-bold text-[var(--care-brand)]">
          TrustKaki
        </div>
        <h1 className="mt-1 text-xl font-bold text-gray-900">
          Sign in to continue
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          Use the caregiver or judge credentials provided privately.
        </p>

        <label className="block mt-4 text-sm font-semibold text-gray-700">
          Email
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={disabled}
            autoComplete="email"
            required
            className="mt-1 min-h-11 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--care-brand)]"
          />
        </label>

        <label className="block mt-3 text-sm font-semibold text-gray-700">
          Password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={disabled}
            autoComplete="current-password"
            required
            className="mt-1 min-h-11 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--care-brand)]"
          />
        </label>

        {error && (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={disabled}
          className="mt-4 min-h-11 w-full rounded-md bg-[var(--care-brand-strong)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--care-brand-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--care-brand)] disabled:opacity-50"
        >
          {disabled ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </div>
  );
}
