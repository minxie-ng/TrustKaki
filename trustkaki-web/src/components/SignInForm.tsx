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
    <main className="flex min-h-screen items-center justify-center bg-[var(--care-mist)] p-6">
      <form
        onSubmit={submit}
        className="w-full max-w-sm border-t-4 border-t-[var(--care-evergreen)] bg-[var(--care-paper)] px-6 py-8"
      >
        <div className="font-display text-xl font-semibold text-[var(--care-evergreen)]">
          TrustKaki
        </div>
        <h1 className="font-display mt-6 text-2xl font-semibold text-[var(--care-ink)]">
          Authorized caregivers and AAC staff
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          Sign in to access the care desk.
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
            className="mt-1 min-h-11 w-full border border-gray-300 px-3 py-2 text-sm"
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
            className="mt-1 min-h-11 w-full border border-gray-300 px-3 py-2 text-sm"
          />
        </label>

        {error && (
          <div role="alert" className="mt-3 border-l-4 border-l-[var(--status-red)] px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={disabled}
          className="mt-4 min-h-11 w-full bg-[var(--care-coral)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--care-coral-hover)] disabled:opacity-50"
        >
          {disabled ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </main>
  );
}
