"use client";

import { useEffect, useMemo, useState } from "react";
import { auth, googleProvider, getSaveUserProfileCallable } from "./firebase";
import { signInWithPopup, onAuthStateChanged, signOut, type User } from "firebase/auth";

export default function Home() {
  const [user, setUser] = useState<null | { uid: string; displayName: string | null }>(null);
  const [jsonText, setJsonText] = useState<string>("{\n  \"hello\": \"world\"\n}");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [saving, setSaving] = useState<boolean>(false);
  const saveFn = useMemo(() => getSaveUserProfileCallable(), []);

  useEffect(() => {
    return onAuthStateChanged(auth, (u: User | null) => {
      if (u) {
        setUser({ uid: u.uid, displayName: u.displayName });
      } else {
        setUser(null);
      }
    });
  }, []);

  function validateJson(text: string) {
    try {
      const parsed = JSON.parse(text);
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        setJsonError("JSON must be an object (dictionary).");
        return null;
      }
      setJsonError(null);
      return parsed as Record<string, unknown>;
    } catch (e: any) {
      setJsonError(e?.message || "Invalid JSON");
      return null;
    }
  }

  async function handleSave() {
    const parsed = validateJson(jsonText);
    if (!parsed) return;
    setSaving(true);
    try {
      await saveFn(parsed);
      alert("Saved");
    } catch (e: any) {
      alert(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-6 flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Project Organizer</h1>
        {user ? (
          <div className="flex items-center gap-3">
            <span className="text-sm opacity-80">{user.displayName || user.uid}</span>
            <button
              className="px-3 py-1.5 rounded border hover:bg-black/5 dark:hover:bg-white/10"
              onClick={() => signOut(auth)}
            >
              Sign out
            </button>
          </div>
        ) : (
          <button
            className="px-3 py-1.5 rounded border hover:bg-black/5 dark:hover:bg-white/10"
            onClick={() => signInWithPopup(auth, googleProvider)}
          >
            Sign in with Google
          </button>
        )}
      </header>

      <section className="flex flex-col gap-3">
        <label className="text-sm font-medium">Your dictionary (JSON object)</label>
        <textarea
          className="font-mono text-sm min-h-64 p-3 rounded border bg-transparent"
          value={jsonText}
          onChange={(e) => setJsonText(e.target.value)}
          onBlur={(e) => validateJson(e.target.value)}
          spellCheck={false}
        />
        {jsonError && <p className="text-sm text-red-600">{jsonError}</p>}
        <div>
          <button
            className="px-4 py-2 rounded bg-black text-white dark:bg-white dark:text-black disabled:opacity-50"
            onClick={handleSave}
            disabled={!user || !!jsonError || saving}
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
        {!user && (
          <p className="text-sm opacity-70">Sign in to save to your profile.</p>
        )}
      </section>
    </div>
  );
}
