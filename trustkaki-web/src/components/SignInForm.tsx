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
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm bg-white border rounded-lg p-5 shadow-sm"
      >
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
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
            className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
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
            className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
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
          className="mt-4 w-full rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {disabled ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </div>
  );
}
