"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { auth, firestore } from "../firebase";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";

type Task = {
  id: string;
  title: string;
  startDate?: string | null; // YYYY-MM-DD
  dueDate: string; // YYYY-MM-DD
  completed?: boolean;
  createdAt?: any;
  order?: number; // per-day ordering
  // Map of YYYY-MM-DD -> completion state for that day (lead-up days)
  dailyCompleted?: Record<string, boolean>;
};

function useTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const uid = auth.currentUser?.uid as string;

  useEffect(() => {
    if (!uid) return;
    const tasksCol = collection(firestore, "users", uid, "tasks");
    const q = query(tasksCol, orderBy("dueDate", "asc"), orderBy("order", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      setTasks(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Task, "id">) })));
    });
    return unsub;
  }, [uid]);

  const addTask = useCallback(async (title: string, dueDate: string, startDate?: string | null) => {
    if (!uid) return;
    const tasksCol = collection(firestore, "users", uid, "tasks");
    // find next order within the day
    const sameDay = tasks.filter((t) => t.dueDate === dueDate);
    const nextOrder = (sameDay[sameDay.length - 1]?.order ?? -1) + 1;
    await addDoc(tasksCol, { title, dueDate, startDate: startDate ?? null, completed: false, createdAt: serverTimestamp(), order: nextOrder, dailyCompleted: {} });
  }, [uid]);

  const updateTask = useCallback(async (taskId: string, data: Partial<Task>) => {
    if (!uid) return;
    await updateDoc(doc(firestore, "users", uid, "tasks", taskId), data);
  }, [uid]);

  const deleteTask = useCallback(async (taskId: string) => {
    if (!uid) return;
    await deleteDoc(doc(firestore, "users", uid, "tasks", taskId));
  }, [uid]);

  return { tasks, addTask, updateTask, deleteTask };
}

export default function Calendar() {
  const { tasks, addTask, updateTask, deleteTask } = useTasks();
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [startDate, setStartDate] = useState<string>("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Build a feed of days around today
  const todayStr = new Date().toISOString().slice(0, 10);
  const daysFeed = useMemo(() => {
    const days: string[] = [];
    const start = new Date();
    start.setDate(start.getDate() - 7);
    for (let i = 0; i < 60; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      days.push(d.toISOString().slice(0, 10));
    }
    return days;
  }, []);

  // tasks by day sorted by order then createdAt
  const tasksByDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of tasks) {
      const key = t.dueDate;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    for (const [k, arr] of map.entries()) {
      arr.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    }
    return map;
  }, [tasks]);

  function formatDayLabel(dateStr: string) {
    const d = new Date(dateStr + "T00:00:00");
    const formatter = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" });
    const label = formatter.format(d);
    if (dateStr === todayStr) return label + " (Today)";
    return label;
  }

  function daysUntilDue(dateStr: string) {
    const today = new Date(todayStr + "T00:00:00");
    const d = new Date(dateStr + "T00:00:00");
    const diff = Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  }

  function daysBetween(a: string, b: string) {
    // returns positive if b is after a in days
    const da = new Date(a + "T00:00:00").getTime();
    const db = new Date(b + "T00:00:00").getTime();
    return Math.round((db - da) / (1000 * 60 * 60 * 24));
  }

  function colorForDayTasks(dateStr: string): (taskId: string) => { bg: string; border: string } {
    // Build per-day spanning list to consistently color leadup duplicates
    const list = tasks
      .filter((t) => (t.startDate || t.dueDate)! <= dateStr && dateStr <= t.dueDate)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || (a.order ?? 0) - (b.order ?? 0));
    const n = Math.max(1, list.length);
    const idToIndex = new Map<string, number>();
    list.forEach((t, i) => idToIndex.set(t.id, i));
    return (taskId: string) => {
      const idx = idToIndex.get(taskId) ?? 0;
      const hue = Math.round((idx / n) * 360);
      const du = daysUntilDue(dateStr);
      // Closer due -> higher saturation; overdue max
      const sat = Math.max(40, Math.min(90, 90 - Math.max(0, du) * 5));
      const bg = `hsl(${hue} ${sat}% 95%)`;
      const border = `hsl(${hue} ${sat}% 55%)`;
      return { bg, border };
    };
  }

  // Drag and drop handlers
  function onTaskDragStart(t: Task, indexInDay: number) {
    return (e: React.DragEvent) => {
      e.dataTransfer.setData("text/task-id", t.id);
      e.dataTransfer.setData("text/from-date", t.dueDate);
      e.dataTransfer.setData("text/from-index", String(indexInDay));
      e.dataTransfer.effectAllowed = "move";
    };
  }

  function onTaskDropOnItem(targetDate: string, targetIndex: number) {
    return async (e: React.DragEvent) => {
      e.preventDefault();
      const taskId = e.dataTransfer.getData("text/task-id");
      const fromDate = e.dataTransfer.getData("text/from-date");
      const fromIndex = Number(e.dataTransfer.getData("text/from-index"));
      if (!taskId) return;
      const list = tasksByDay.get(targetDate) || [];
      const isSameDay = fromDate === targetDate;
      if (isSameDay) {
        // Reorder within the same day
        const reordered = [...list];
        const currentIndex = fromIndex;
        const [removed] = reordered.splice(currentIndex, 1);
        const insertIndex = targetIndex <= currentIndex ? targetIndex : targetIndex - 1;
        reordered.splice(insertIndex, 0, removed);
        await Promise.all(
          reordered.map((task, idx) => updateTask(task.id, { order: idx }))
        );
      } else {
        // Move to target day at targetIndex, recompute orders for both days
        const fromList = (tasksByDay.get(fromDate) || []).filter((t) => t.id !== taskId);
        const toList = [...list];
        const moving = tasks.find((t) => t.id === taskId);
        if (!moving) return;
        moving.dueDate = targetDate;
        toList.splice(targetIndex, 0, moving);
        await Promise.all([
          updateTask(taskId, { dueDate: targetDate }),
          ...fromList.map((t, idx) => updateTask(t.id, { order: idx })),
          ...toList.map((t, idx) => updateTask(t.id, { order: idx })),
        ]);
      }
    };
  }

  function onDayDrop(dateStr: string) {
    return async (e: React.DragEvent) => {
      e.preventDefault();
      const taskId = e.dataTransfer.getData("text/task-id");
      if (!taskId) return;
      const list = tasksByDay.get(dateStr) || [];
      await updateTask(taskId, { dueDate: dateStr, order: list.length });
      // Reindex this day
      await Promise.all(list.map((t, idx) => updateTask(t.id, { order: idx })));
    };
  }

  // Track whether Today header is visible
  const [todayVisible, setTodayVisible] = useState(true);
  const [todayAbove, setTodayAbove] = useState(false);
  const listId = "calendar-feed";

  useEffect(() => {
    const container = document.getElementById(listId);
    if (!container) return;
    const handler = () => {
      const items = container.querySelectorAll('[data-day]');
      let visible = false;
      items.forEach((el) => {
        const day = (el as HTMLElement).dataset.day;
        if (day === todayStr) {
          const rect = (el as HTMLElement).getBoundingClientRect();
          const parentRect = container.getBoundingClientRect();
          visible = rect.top >= parentRect.top && rect.bottom <= parentRect.bottom;
          setTodayAbove(rect.top < parentRect.top);
        }
      });
      setTodayVisible(visible);
    };
    handler();
    container.addEventListener('scroll', handler);
    return () => container.removeEventListener('scroll', handler);
  }, [todayStr]);

  function scrollToToday() {
    const container = document.getElementById(listId);
    if (!container) return;
    const el = container.querySelector('[data-day="' + todayStr + '"]') as HTMLElement | null;
    if (el) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }

  // Per-day completion update helper
  const setDailyCompletion = useCallback(async (taskId: string, dateStr: string, value: boolean) => {
    // Updates nested map field dailyCompleted[dateStr] = value
    const dynamicKey: Record<string, any> = {};
    dynamicKey[`dailyCompleted.${dateStr}`] = value;
    await updateTask(taskId, dynamicKey as Partial<Task>);
  }, [updateTask]);

  return (
    <div className="max-w-6xl mx-auto p-6 flex gap-6">
      {/* Sidebar: Create/Edit Task */}
      <aside className="w-full max-w-sm shrink-0 self-start sticky top-4 h-fit rounded border p-4 bg-white shadow-sm">
        <div className="text-lg font-semibold mb-3">Tasks</div>
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium">Title</label>
            <input className="mt-1 w-full border rounded px-2 py-1 bg-white" placeholder="Task title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium">Start date</label>
              <input className="mt-1 w-full border rounded px-2 py-1 bg-white" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium">Due date</label>
              <input className="mt-1 w-full border rounded px-2 py-1 bg-white" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>
          <button className="w-full px-3 py-2 rounded bg-black text-white cursor-pointer" onClick={() => { const t = title.trim(); if (t) { void addTask(t, dueDate, startDate || null); setTitle(""); } }}>Add task</button>
        </div>

        {selectedId && (
          <div className="mt-6 pt-4 border-t">
            <div className="text-sm font-medium mb-2">Selected task</div>
            {tasks.filter((t) => t.id === selectedId).map((t) => (
              <div key={t.id} className="space-y-2">
                <input className="w-full border rounded px-2 py-1" value={t.title} onChange={(e) => updateTask(t.id, { title: e.target.value })} />
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <input className="border rounded px-2 py-1" type="date" value={t.startDate || ""} onChange={(e) => updateTask(t.id, { startDate: e.target.value || null })} />
                  <input className="border rounded px-2 py-1" type="date" value={t.dueDate} onChange={(e) => updateTask(t.id, { dueDate: e.target.value })} />
                </div>
                <div className="flex items-center justify-between text-sm">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={!!t.completed} onChange={(e) => updateTask(t.id, { completed: e.target.checked })} />
                    Completed
                  </label>
                  <button className="px-2 py-1 border rounded cursor-pointer" onClick={() => deleteTask(t.id)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </aside>

      {/* Calendar feed */}
      <section className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xl font-semibold">Calendar</div>
          {!todayVisible && (
            <button className="px-3 py-1.5 border rounded bg-white text-red-600 flex items-center gap-2 cursor-pointer" onClick={scrollToToday}>
              <span className={`inline-block ${todayAbove ? '' : 'rotate-180'}`}>↑</span>
              Today
            </button>
          )}
        </div>
        <div id={listId} className="rounded border bg-white shadow-sm max-h-[70vh] overflow-auto divide-y">
          {daysFeed.map((dateStr) => {
            // Spanning list: tasks visible on this day
            const spanningList = tasks
              .filter((t) => (t.startDate || t.dueDate)! <= dateStr && dateStr <= t.dueDate)
              .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || (a.order ?? 0) - (b.order ?? 0));
            const colorFor = colorForDayTasks(dateStr);
            return (
              <div key={dateStr} className="p-3" data-day={dateStr} onDragOver={(e) => e.preventDefault()} onDrop={onDayDrop(dateStr)}>
                <div className="text-sm font-medium mb-2 flex items-center justify-between">
                  <span>
                    {dateStr === todayStr ? (
                      <span className="text-red-600 font-semibold">{formatDayLabel(dateStr)}</span>
                    ) : (
                      formatDayLabel(dateStr)
                    )}
                  </span>
                  <span className="opacity-60">{spanningList.length} task{spanningList.length === 1 ? "" : "s"}</span>
                </div>
                <ul className="flex flex-col gap-2">
                  {spanningList.map((t, idx) => {
                    const c = colorFor(t.id);
                    // Saturation: n days before due => Max(0, 100 - 10*n)%
                    const nDaysBeforeDue = Math.max(0, daysBetween(dateStr, t.dueDate));
                    const satPercent = Math.max(0, 100 - 10 * nDaysBeforeDue);
                    const baseStyle = { background: c.bg, borderColor: c.border } as React.CSSProperties;
                    const isDueDay = dateStr === t.dueDate;
                    const minimized = !isDueDay; // leadup duplicates are un-editable blocks
                    const isPast = dateStr < todayStr;
                    const dayChecked = !!t.dailyCompleted?.[dateStr];
                    return (
                      <li key={t.id + ':' + dateStr}
                          draggable={isDueDay && !t.completed}
                          onDragStart={isDueDay && !t.completed ? onTaskDragStart(t, idx) : undefined}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={isDueDay && !t.completed ? onTaskDropOnItem(dateStr, idx) : undefined}
                          onClick={() => { setSelectedId(t.id); setSelectedDate(dateStr); }}
                          className={`rounded border p-3 flex items-center justify-between ${minimized ? 'opacity-80 cursor-pointer' : 'cursor-grab active:cursor-grabbing'}`}
                          style={{ ...baseStyle, filter: `saturate(${(isDueDay ? 100 : satPercent) / 100})` }}>
                        <div className="flex items-center gap-3 flex-1">
                          {isDueDay ? (
                            <input type="checkbox" checked={!!t.completed} onChange={(e) => updateTask(t.id, { completed: e.target.checked })} />
                          ) : (
                            <input
                              title={isPast ? 'Past day' : 'Mark progress for this day'}
                              type="checkbox"
                              checked={dayChecked}
                              disabled={isPast}
                              onChange={(e) => setDailyCompletion(t.id, dateStr, e.target.checked)}
                            />
                          )}
                          <div className="flex-1">
                            <div className="font-medium">{t.title}</div>
                            {t.startDate && !isDueDay && (
                              <div className="text-xs opacity-70">{nDaysBeforeDue} day{nDaysBeforeDue === 1 ? "" : "s"} to due date</div>
                            )}
                          </div>
                        </div>
                        {!minimized && (
                          <div className="flex items-center gap-2 text-sm">
                            <input className="border rounded px-2 py-1 bg-white" type="date" value={t.startDate || ""} onChange={(e) => updateTask(t.id, { startDate: e.target.value || null })} />
                            <input className="border rounded px-2 py-1 bg-white" type="date" value={t.dueDate} onChange={(e) => updateTask(t.id, { dueDate: e.target.value })} />
                            <button className="px-2 py-1 border rounded bg-white cursor-pointer" onClick={() => deleteTask(t.id)}>Delete</button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}


