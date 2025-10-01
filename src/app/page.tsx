"use client";

import { useState } from "react";
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
  const [tab, setTab] = useState<"organizer" | "calendar">("organizer");

  return (
    <AuthGate>
      <Tabs active={tab} onChange={setTab} />
      {tab === "organizer" ? <Organizer /> : <Calendar />}
    </AuthGate>
  );
}
