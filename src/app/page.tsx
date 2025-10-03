"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import AuthGate from "./components/AuthGate";
import Organizer from "./components/Organizer";
import Calendar from "./components/Calendar";

function Tabs({ active, onChange }: { active: "organizer" | "calendar"; onChange: (t: "organizer" | "calendar") => void }) {
  return (
    <div className="w-full border-b">
      <div className="max-w-5xl mx-auto px-4">
        <nav className="flex gap-4">
          {(["organizer", "calendar"] as const).map((key) => (
            <button
              key={key}
              className={`px-3 py-3 -mb-px border-b-2 cursor-pointer ${active === key ? "border-black dark:border-white font-medium" : "border-transparent opacity-70 hover:opacity-100"}`}
              onClick={() => onChange(key)}
            >
              {key === "organizer" ? "Projects" : "Calendar"}
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}

function OrganizerPlaceholder() {
  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="opacity-70">Organizer coming next: projects grid, notes preview, drag & drop…</div>
    </div>
  );
}

function CalendarPlaceholder() {
  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="opacity-70">Calendar coming next: tasks with due/start dates…</div>
    </div>
  );
}

export default function Home() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const tabFromQuery = (searchParams.get("tab") as "organizer" | "calendar" | null) || null;
  const initialTab = tabFromQuery && ["organizer", "calendar"].includes(tabFromQuery) ? tabFromQuery : "organizer";
  const [tab, setTab] = useState<"organizer" | "calendar">(initialTab);

  // Keep internal state in sync with URL query changes (e.g., back/forward nav)
  useEffect(() => {
    const qTab = (searchParams.get("tab") as "organizer" | "calendar" | null);
    if (!qTab || (qTab !== "organizer" && qTab !== "calendar")) {
      return;
    }
    if (qTab !== tab) {
      setTab(qTab);
    }
  }, [searchParams, tab]);

  // Ensure URL contains the current tab on first load
  useEffect(() => {
    const qTab = searchParams.get("tab");
    if (!qTab) {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", tab);
      router.replace(`${pathname}?${params.toString()}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChange = (next: "organizer" | "calendar") => {
    setTab(next);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", next);
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <AuthGate>
      <Tabs active={tab} onChange={handleChange} />
      {tab === "organizer" ? <Organizer /> : <Calendar />}
    </AuthGate>
  );
}
