"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FiMapPin, FiEdit2, FiTrash2, FiCheckCircle, FiRotateCcw, FiMoreVertical } from "react-icons/fi";
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
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { PiPushPin } from "react-icons/pi";

type Project = {
  id: string;
  name: string;
  createdAt?: any;
  order?: number;
  pinned?: boolean;
  completed?: boolean;
  // If pinned and completed, after this interval it returns to active automatically
  returnIntervalMs?: number;
  // Timestamp when marked completed (ms since epoch)
  completedAt?: number | null;
};

type Note = {
  id: string;
  title: string;
  content: string;
  order: number;
  pinned?: boolean;
  pinIntervalMs?: number;
  lastPinnedAt?: number;
  completed?: boolean;
  updatedAt?: any;
};

function useProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const uid = auth.currentUser?.uid as string;

  useEffect(() => {
    if (!uid) return;
    const projectsCol = collection(firestore, "users", uid, "projects");
    const q = query(projectsCol, orderBy("completed", "asc"), orderBy("pinned", "desc"), orderBy("order", "asc"), orderBy("createdAt", "asc"));
    const unsub = onSnapshot(q, { includeMetadataChanges: true }, (snap) => {
      setProjects(
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Project, "id">) }))
      );
    });
    return unsub;
  }, [uid]);

  const addProject = useCallback(async (name: string) => {
    if (!uid) return;
    const projectsCol = collection(firestore, "users", uid, "projects");
    const nextOrder = (projects.filter(p => !p.completed).at(-1)?.order ?? -1) + 1;
    await addDoc(projectsCol, { name, createdAt: serverTimestamp(), order: nextOrder, pinned: false, completed: false, returnIntervalMs: 3 * 24 * 60 * 60 * 1000, completedAt: null });
  }, [uid]);

  const renameProject = useCallback(async (projectId: string, name: string) => {
    if (!uid) return;
    await updateDoc(doc(firestore, "users", uid, "projects", projectId), { name });
  }, [uid]);

  const deleteProjectById = useCallback(async (projectId: string) => {
    if (!uid) return;
    await deleteDoc(doc(firestore, "users", uid, "projects", projectId));
  }, [uid]);

  const updateProject = useCallback(async (projectId: string, data: Partial<Project>) => {
    if (!uid) return;
    await updateDoc(doc(firestore, "users", uid, "projects", projectId), data);
  }, [uid]);

  const reorderProjects = useCallback(async (orderedIds: string[]) => {
    if (!uid) return;
    await Promise.all(orderedIds.map((id, idx) => updateDoc(doc(firestore, "users", uid, "projects", id), { order: idx })));
  }, [uid]);

  return { projects, addProject, renameProject, deleteProjectById, updateProject, reorderProjects };
}

function useNotes(projectId: string | null) {
  const [notes, setNotes] = useState<Note[]>([]);
  const uid = auth.currentUser?.uid as string;

  useEffect(() => {
    if (!uid || !projectId) return;
    const notesCol = collection(firestore, "users", uid, "projects", projectId, "notes");
    const q = query(notesCol, orderBy("order", "asc"));
    const unsub = onSnapshot(q, { includeMetadataChanges: true }, (snap) => {
      setNotes(
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Note, "id">) }))
      );
    });
    return unsub;
  }, [uid, projectId]);

  const addNote = useCallback(async (title: string) => {
    if (!uid || !projectId) return;
    const nextOrder = (notes[notes.length - 1]?.order ?? -1) + 1;
    const notesCol = collection(firestore, "users", uid, "projects", projectId, "notes");
    await addDoc(notesCol, {
      title,
      content: "",
      order: nextOrder,
      pinned: false,
      pinIntervalMs: 24 * 60 * 60 * 1000,
      lastPinnedAt: Date.now(),
      completed: false,
      updatedAt: serverTimestamp(),
    });
  }, [uid, projectId, notes]);

  const updateNote = useCallback(async (noteId: string, data: Partial<Note>) => {
    if (!uid || !projectId) return;
    const ref = doc(firestore, "users", uid, "projects", projectId, "notes", noteId);
    await updateDoc(ref, { ...data, updatedAt: serverTimestamp() });
  }, [uid, projectId]);

  const deleteNote = useCallback(async (noteId: string) => {
    if (!uid || !projectId) return;
    await deleteDoc(doc(firestore, "users", uid, "projects", projectId, "notes", noteId));
  }, [uid, projectId]);

  const reorderNotes = useCallback(async (startIndex: number, endIndex: number) => {
    if (!uid || !projectId) return;
    const reordered = [...notes];
    const [removed] = reordered.splice(startIndex, 1);
    reordered.splice(endIndex, 0, removed);
    // Persist order indices sequentially
    await Promise.all(
      reordered.map((n, idx) =>
        updateDoc(
          doc(firestore, "users", uid, "projects", projectId, "notes", n.id),
          { order: idx }
        )
      )
    );
  }, [uid, projectId, notes]);

  return { notes, addNote, updateNote, deleteNote, reorderNotes };
}

function ProjectCard({ project, onOpen, onRename, onDelete, onPinToggle, onCompleteToggle, onReturnIntervalChange, nowMs, previewTitles, draggableProps }: {
  project: Project;
  onOpen: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
  onPinToggle: () => void;
  onCompleteToggle: () => void;
  onReturnIntervalChange: (ms: number) => void;
  nowMs: number;
  previewTitles: string[];
  draggableProps: {
    draggable: boolean;
    onDragStart?: () => void;
    onDragOver?: (e: React.DragEvent) => void;
    onDrop?: () => void;
  };
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(project.name);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [menuRef]);

  const remainingMs = project.completed && project.pinned
    ? Math.max(0, ((project.completedAt ?? 0) + (project.returnIntervalMs ?? (3 * 24 * 60 * 60 * 1000)) - nowMs))
    : 0;
  function formatRemaining(ms: number) {
    const totalSec = Math.ceil(ms / 1000);
    const days = Math.floor(totalSec / 86400);
    const hours = Math.floor((totalSec % 86400) / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    if (days > 0) return `${days} day${days === 1 ? "" : "s"} ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }
  return (
    <div className={`rounded border p-4 flex flex-col gap-3 ${project.completed ? "opacity-70" : ""}`}
         {...draggableProps}
    >
      {editing ? (
        <div className="flex items-center gap-2">
          <input className="border rounded px-2 py-1 flex-1 bg-transparent" value={name} onChange={(e) => setName(e.target.value)} />
          <button className="px-2 py-1 border rounded cursor-pointer" onClick={() => { onRename(name.trim() || project.name); setEditing(false); }}>Save</button>
          <button className="px-2 py-1 border rounded cursor-pointer" onClick={() => { setName(project.name); setEditing(false); }}>Cancel</button>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <div className="font-medium">{project.name}</div>
        </div>
      )}
      <div className="text-sm opacity-70 line-clamp-3 min-h-5">
        {project.completed && project.pinned ? (
          <span>Returns to projects in {formatRemaining(remainingMs)}</span>
        ) : (
          <span>{previewTitles.length ? previewTitles.map((noteTitle, index) => <div key={index}>{noteTitle}</div>) : "No notes yet"}</span>
        )}
      </div>
      {/* Action buttons pinned to bottom */}
      <div className="mt-auto flex items-center justify-end gap-2 text-sm">
        <button className="px-2 py-1 border rounded cursor-pointer" onClick={onOpen}>Open</button>
        {project.completed && project.pinned && (
          <select
            className="px-2 py-1 border rounded cursor-pointer"
            title="Auto-return interval"
            value={String(project.returnIntervalMs ?? (3 * 24 * 60 * 60 * 1000))}
            onChange={(e) => onReturnIntervalChange(Number(e.target.value))}
          >
            <option value={String(24 * 60 * 60 * 1000)}>1 day</option>
            <option value={String(3 * 24 * 60 * 60 * 1000)}>3 days</option>
            <option value={String(7 * 24 * 60 * 60 * 1000)}>7 days</option>
            <option value={String(14 * 24 * 60 * 60 * 1000)}>14 days</option>
          </select>
        )}
        <div className="relative">
          <button
            title="More actions"
            aria-label="More actions"
            className="p-2 border rounded cursor-pointer inline-flex items-center justify-center"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <FiMoreVertical />
          </button>
          {menuOpen && (
            <div
              ref={menuRef}
              className="absolute right-0 bottom-full mb-2 w-40 bg-white dark:bg-black border rounded shadow-lg z-10"
            >
              <ul className="divide-y dark:divide-gray-700">
                <li><button className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-2" onClick={() => { onPinToggle(); setMenuOpen(false); }}>
                  <PiPushPin color={project.pinned ? 'red' : 'currentColor'} /> {project.pinned ? "Unpin" : "Pin"}
                </button></li>
                <li><button className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-2" onClick={() => { onCompleteToggle(); setMenuOpen(false); }}>
                  {project.completed ? <FiRotateCcw /> : <FiCheckCircle />} {project.completed ? "Recover" : "Complete"}
                </button></li>
                <li><button className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-2" onClick={() => { setEditing(true); setMenuOpen(false); }}>
                  <FiEdit2 /> Rename
                </button></li>
                <li><button className="w-full text-left px-3 py-2 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/50 flex items-center gap-2" onClick={() => { onDelete(); setMenuOpen(false); }}>
                  <FiTrash2 /> Delete
                </button></li>
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function NotesList({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const { notes, addNote, updateNote, deleteNote, reorderNotes } = useNotes(projectId);
  const [newTitle, setNewTitle] = useState("");
  const dragIndexRef = useRef<number | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpenMenuId(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [menuRef]);

  const visibleNotes = useMemo(() => {
    const now = Date.now();
    return notes
      .filter((n) => !n.completed)
      .sort((a, b) => {
        const aPinnedActive = a.pinned && (a.lastPinnedAt ?? 0) + (a.pinIntervalMs ?? 0) > now;
        const bPinnedActive = b.pinned && (b.lastPinnedAt ?? 0) + (b.pinIntervalMs ?? 0) > now;
        if (aPinnedActive !== bPinnedActive) return aPinnedActive ? -1 : 1;
        return a.order - b.order;
      });
  }, [notes]);

  const completedNotes = useMemo(() => notes.filter((n) => n.completed), [notes]);

  function handleDragStart(index: number) {
    dragIndexRef.current = index;
  }
  async function handleDrop(index: number) {
    const start = dragIndexRef.current;
    dragIndexRef.current = null;
    if (start === null || start === index) return;
    await reorderNotes(start, index);
  }

  return (
    <div className="max-w-5xl mx-auto p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="text-xl font-semibold">Notes</div>
        <button className="px-3 py-1.5 border rounded cursor-pointer" onClick={onClose}>Back to projects</button>
      </div>
      <div className="flex items-center gap-2">
        <input className="border rounded px-2 py-1 bg-transparent flex-1" placeholder="New note title" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
        <button className="px-3 py-1.5 border rounded cursor-pointer" onClick={() => { const t = newTitle.trim(); if (t) { void addNote(t); setNewTitle(""); } }}>Add</button>
      </div>
      <ul className="flex flex-col gap-2">
        {visibleNotes.map((n, idx) => (
          <li key={n.id}
              draggable
              onDragStart={() => handleDragStart(idx)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => void handleDrop(idx)}
              className="rounded border p-3">
            <div className="flex items-center justify-between gap-2">
              <input className="font-medium bg-transparent flex-1 outline-none" value={n.title} onChange={(e) => updateNote(n.id, { title: e.target.value })} />
              <div className="flex items-center gap-2 text-sm">
                <div className="relative">
                  <button
                    title="More actions"
                    aria-label="More actions"
                    className="p-2 -m-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"
                    onClick={() => setOpenMenuId(openMenuId === n.id ? null : n.id)}
                  >
                    <FiMoreVertical />
                  </button>
                  {openMenuId === n.id && (
                    <div
                      ref={menuRef}
                      className="absolute right-0 top-full mt-2 w-40 bg-white dark:bg-black border rounded shadow-lg z-10"
                    >
                      <ul className="divide-y dark:divide-gray-700">
                        <li><button className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-2" onClick={() => { updateNote(n.id, { pinned: !n.pinned, lastPinnedAt: Date.now() }); setOpenMenuId(null); }}>
                          <PiPushPin color={n.pinned ? 'red' : 'currentColor'} /> {n.pinned ? "Unpin" : "Pin"}
                        </button></li>
                        <li><button className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-2" onClick={() => { updateNote(n.id, { completed: true }); setOpenMenuId(null); }}>
                          <FiCheckCircle /> Complete
                        </button></li>
                        <li><button className="w-full text-left px-3 py-2 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/50 flex items-center gap-2" onClick={() => { deleteNote(n.id); setOpenMenuId(null); }}>
                          <FiTrash2 /> Delete
                        </button></li>
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <textarea className="mt-2 w-full min-h-24 bg-transparent border rounded p-2 text-sm" value={n.content} onChange={(e) => updateNote(n.id, { content: e.target.value })} />
          </li>
        ))}
      </ul>

      {completedNotes.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer select-none">Completed ({completedNotes.length})</summary>
          <ul className="mt-2 flex flex-col gap-2">
            {completedNotes.map((n) => (
              <li key={n.id} className="rounded border p-3 flex items-center justify-between">
                <div className="opacity-80">{n.title}</div>
                <div className="flex items-center gap-2 text-sm">
                  <button className="px-2 py-1 border rounded cursor-pointer" onClick={() => updateNote(n.id, { completed: false })}>Recover</button>
                  <button className="px-2 py-1 border rounded cursor-pointer" onClick={() => deleteNote(n.id)}>Delete</button>
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

export default function Organizer() {
  const { projects, addProject, renameProject, deleteProjectById, updateProject, reorderProjects } = useProjects();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [openProjectId, setOpenProjectId] = useState<string | null>(null);

  const previews = useRef<Record<string, string[]>>({});
  const uid = auth.currentUser?.uid as string;
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  // Tick to update remaining-time display roughly each minute
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60 * 1000);
    return () => clearInterval(id);
  }, []);

  // Subscribe to preview titles (3 most recently updated notes per project)
  useEffect(() => {
    if (!uid) return;
    const unsubs: Array<() => void> = [];
    projects.forEach((p) => {
      const notesCol = collection(firestore, "users", uid, "projects", p.id, "notes");
      const q = query(notesCol, orderBy("updatedAt", "desc"));
      const unsub = onSnapshot(q, (snap) => {
        previews.current[p.id] = snap.docs.slice(0, 3).map((d) => (d.data() as Note).title);
      });
      unsubs.push(unsub);
    });
    return () => { unsubs.forEach((u) => u()); };
  }, [uid, projects]);

  // Drag state for projects within active list
  const activeProjects = useMemo(() => projects.filter(p => !p.completed), [projects]);
  const completedProjects = useMemo(() => projects.filter(p => p.completed), [projects]);
  const dragIndexRef = useRef<number | null>(null);

  // Auto-return pinned completed projects when their interval has elapsed
  useEffect(() => {
    const candidates = projects.filter(p => p.pinned && p.completed);
    candidates.forEach((p) => {
      const interval = p.returnIntervalMs ?? (3 * 24 * 60 * 60 * 1000);
      const completedAt = p.completedAt ?? 0;
      if (!completedAt) return;
      if (completedAt + interval <= Date.now()) {
        const nextOrder = (activeProjects.at(-1)?.order ?? -1) + 1;
        void updateProject(p.id, { completed: false, order: nextOrder, completedAt: null });
      }
    });
  }, [projects, activeProjects, updateProject]);

  return (
    openProjectId ? (
      <NotesList projectId={openProjectId} onClose={() => setOpenProjectId(null)} />
    ) : (
    <div className="max-w-5xl mx-auto p-6 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="text-xl font-semibold">Projects</div>
        {adding ? (
          <div className="flex items-center gap-2">
            <input className="border rounded px-2 py-1 bg-transparent" autoFocus placeholder="Project name" value={name} onChange={(e) => setName(e.target.value)} />
            <button className="px-3 py-1.5 border rounded cursor-pointer" onClick={() => { const v = name.trim(); if (v) { void addProject(v); setName(""); setAdding(false); } }}>Add</button>
            <button className="px-3 py-1.5 border rounded cursor-pointer" onClick={() => { setAdding(false); setName(""); }}>Cancel</button>
          </div>
        ) : (
          <button className="px-3 py-1.5 border rounded cursor-pointer" onClick={() => setAdding(true)}>New project</button>
        )}
      </div>

      {/* Active projects (draggable to reorder) */}
      <div className="grid grid-cols-1 md:grid-cols-1 lg:grid-cols-2 gap-4">
        {activeProjects.map((p, idx) => (
          <ProjectCard
            key={p.id}
            project={p}
            onOpen={() => setOpenProjectId(p.id)}
            onRename={(n) => void renameProject(p.id, n)}
            onDelete={() => void deleteProjectById(p.id)}
            onPinToggle={() => void updateProject(p.id, { pinned: !p.pinned })}
            onCompleteToggle={() => {
              if (!p.completed) {
                void updateProject(p.id, { completed: true, completedAt: Date.now() });
              } else {
                const nextOrder = (activeProjects.at(-1)?.order ?? -1) + 1;
                void updateProject(p.id, { completed: false, completedAt: null, order: nextOrder });
              }
            }}
            onReturnIntervalChange={(ms) => void updateProject(p.id, { returnIntervalMs: ms })}
            nowMs={nowMs}
            previewTitles={previews.current[p.id] || []}
            draggableProps={{
              draggable: true,
              onDragStart: () => { dragIndexRef.current = idx; },
              onDragOver: (e) => e.preventDefault(),
              onDrop: () => {
                const start = dragIndexRef.current;
                dragIndexRef.current = null;
                if (start === null || start === idx) return;
                const reordered = [...activeProjects];
                const [removed] = reordered.splice(start, 1);
                reordered.splice(idx, 0, removed);
                void reorderProjects(reordered.map(r => r.id));
              }
            }}
          />
        ))}
      </div>

      {/* Completed archive */}
      {completedProjects.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer select-none">Completed projects ({completedProjects.length})</summary>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-1 lg:grid-cols-2 gap-4">
            {completedProjects.map((p) => (
              <ProjectCard
                key={p.id}
                project={p}
                onOpen={() => setOpenProjectId(p.id)}
                onRename={(n) => void renameProject(p.id, n)}
                onDelete={() => void deleteProjectById(p.id)}
                onPinToggle={() => void updateProject(p.id, { pinned: !p.pinned })}
                onCompleteToggle={() => {
                  if (!p.completed) {
                    void updateProject(p.id, { completed: true, completedAt: Date.now() });
                  } else {
                    const nextOrder = (activeProjects.at(-1)?.order ?? -1) + 1;
                    void updateProject(p.id, { completed: false, completedAt: null, order: nextOrder });
                  }
                }}
                onReturnIntervalChange={(ms) => void updateProject(p.id, { returnIntervalMs: ms })}
                nowMs={nowMs}
                previewTitles={previews.current[p.id] || []}
                draggableProps={{ draggable: false }}
              />
            ))}
          </div>
        </details>
      )}
    </div>
    )
  );
}


