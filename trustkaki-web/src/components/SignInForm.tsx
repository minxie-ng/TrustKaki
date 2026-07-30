"use client";

import { useState } from "react";

interface SignInFormProps {
  onSignIn: (email: string, password: string) => Promise<void>;
  onExploreDemo: () => void;
  disabled?: boolean;
  error?: string | null;
}

export default function SignInForm({
  onSignIn,
  onExploreDemo,
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
        className="w-full max-w-md border-t-4 border-t-[var(--care-evergreen)] bg-[var(--care-paper)] px-6 py-8"
      >
        <div className="font-display text-xl font-semibold text-[var(--care-evergreen)]">
          TrustKaki
        </div>
        <h1 className="font-display mt-6 text-2xl font-semibold text-[var(--care-ink)]">
          Explore the care workspace
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          Choose the guided walkthrough or enter the live, Supabase-backed system.
        </p>

        <section className="mt-6 border-l-4 border-l-[var(--care-coral)] pl-4">
          <p className="text-xs font-bold uppercase text-[var(--care-coral)]">
            Recommended for reviewers
          </p>
          <h2 className="font-display mt-1 text-lg font-semibold text-[var(--care-ink)]">
            Explore demo
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            Complete the four-step walkthrough with fictional data. No account is required and no messages are sent.
          </p>
          <button
            type="button"
            onClick={onExploreDemo}
            disabled={disabled}
            className="mt-3 min-h-11 w-full bg-[var(--care-coral)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--care-coral-hover)] disabled:opacity-50"
          >
            Explore demo - no login
          </button>
        </section>

        <div className="my-6 border-t border-gray-200" />

        <section aria-labelledby="live-backend-heading">
          <h2 id="live-backend-heading" className="font-display text-lg font-semibold text-[var(--care-ink)]">
            Live backend access
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            Use the temporary judge credentials from the submitted deck. After signing in, choose <strong>Live system demo</strong> in the top navigation.
          </p>

        <label className="mt-4 block text-sm font-semibold text-gray-700">
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
          className="mt-4 min-h-11 w-full border border-[var(--care-evergreen)] px-4 py-2 text-sm font-semibold text-[var(--care-evergreen)] hover:bg-[var(--care-mist)] disabled:opacity-50"
        >
          {disabled ? "Signing in..." : "Sign in to live system"}
        </button>
          <p className="mt-3 text-center text-xs text-gray-500">
            Live access is restricted to the fictional demo senior.
          </p>
        </section>
      </form>
    </main>
  );
}
