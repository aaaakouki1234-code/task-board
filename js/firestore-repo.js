// FirestoreTaskRepository — implements list / add / complete / remove / subscribe.
// Tasks are stored at /spaces/{spaceId}/tasks/{taskId}. The spaceId acts as
// an unguessable shared secret in the URL; Firestore rules enforce the
// minimum-length check.

import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  onSnapshot,
  query,
  orderBy,
  where,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { db } from "./firebase-app.js";

function newId() {
  return (
    "task_" +
    Date.now().toString(36) +
    "_" +
    Math.random().toString(36).slice(2, 8)
  );
}

function nowIso() {
  return new Date().toISOString();
}

export class FirestoreTaskRepository {
  constructor(spaceId) {
    if (!spaceId) throw new Error("spaceId required");
    this.spaceId = spaceId;
    this.col = collection(db, "spaces", spaceId, "tasks");
  }

  async list() {
    const q = query(this.col, orderBy("displayOrder", "asc"));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data());
  }

  async add(text) {
    const trimmed = String(text || "").trim();
    if (!trimmed) throw new Error("タスク本文は必須です");

    const tasks = await this.list();
    const maxOrder = tasks.reduce(
      (m, t) => Math.max(m, Number(t.displayOrder) || 0),
      0,
    );
    const id = newId();
    const task = {
      id,
      text: trimmed,
      status: "active",
      createdAt: nowIso(),
      completedAt: null,
      displayOrder: maxOrder + 1,
    };
    await setDoc(doc(this.col, id), task);
    return task;
  }

  async complete(id) {
    await updateDoc(doc(this.col, id), {
      status: "done",
      completedAt: nowIso(),
    });
  }

  // Restore a completed task back to the active list (placed at the bottom).
  async restore(id) {
    const tasks = await this.list();
    const maxOrder = tasks
      .filter((t) => t.status === "active")
      .reduce((m, t) => Math.max(m, Number(t.displayOrder) || 0), 0);
    await updateDoc(doc(this.col, id), {
      status: "active",
      completedAt: null,
      displayOrder: maxOrder + 1,
    });
  }

  // Update arbitrary fields (currently used for editing text).
  async updateText(id, text) {
    const trimmed = String(text || "").trim();
    if (!trimmed) throw new Error("タスク本文は必須です");
    await updateDoc(doc(this.col, id), { text: trimmed });
  }

  // Swap displayOrder of two active tasks (used for up/down reordering).
  async swapOrder(idA, orderA, idB, orderB) {
    const batch = writeBatch(db);
    batch.update(doc(this.col, idA), { displayOrder: orderB });
    batch.update(doc(this.col, idB), { displayOrder: orderA });
    await batch.commit();
  }

  async remove(id) {
    await deleteDoc(doc(this.col, id));
  }

  // Bulk-delete all completed tasks.
  async clearCompleted() {
    const q = query(this.col, where("status", "==", "done"));
    const snap = await getDocs(q);
    if (snap.empty) return 0;
    const batch = writeBatch(db);
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    return snap.size;
  }

  subscribe(callback) {
    return onSnapshot(this.col, () => callback(), (err) => {
      console.error("Firestore subscribe error:", err);
    });
  }
}
