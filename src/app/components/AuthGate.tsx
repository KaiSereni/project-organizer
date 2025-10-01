"use client";

import { useEffect, useState } from "react";
import { auth, googleProvider } from "../firebase";
import { onAuthStateChanged, signInWithPopup, signOut, type User } from "firebase/auth";

type AuthGateProps = {
  children: React.ReactNode;
};

export default function AuthGate({ children }: AuthGateProps) {
  const [user, setUser] = useState<null | { uid: string; displayName: string | null }>(null);
  const [initializing, setInitializing] = useState<boolean>(true);

  useEffect(() => {
    return onAuthStateChanged(auth, (u: User | null) => {
      if (u) {
        setUser({ uid: u.uid, displayName: u.displayName });
      } else {
        setUser(null);
      }
      setInitializing(false);
    });
  }, []);

  if (initializing) {
    return (
      <div className="min-h-dvh grid place-items-center">
        <div className="opacity-60">Loading…</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-dvh flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded border p-6 flex flex-col gap-4 items-center text-center">
          <h1 className="text-xl font-semibold">Sign in</h1>
          <p className="opacity-80 text-sm">Please sign in to access your projects and calendar.</p>
          <button
            className="px-4 py-2 rounded bg-black text-white dark:bg-white dark:text-black"
            onClick={() => signInWithPopup(auth, googleProvider)}
          >
            Continue with Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex flex-col">
      <header className="w-full border-b">
        <div className="max-w-5xl mx-auto p-4 flex items-center justify-between">
          <div className="font-medium">Project Organizer</div>
          <div className="flex items-center gap-3 text-sm">
            <span className="opacity-80">{user.displayName || user.uid}</span>
            <button
              className="px-3 py-1.5 rounded border hover:bg-black/5 dark:hover:bg-white/10"
              onClick={() => signOut(auth)}
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="flex-1">
        {children}
      </main>
    </div>
  );
}


