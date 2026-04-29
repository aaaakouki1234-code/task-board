// Task storage layer
// 抽象化された TaskRepository インターフェースを介して、
// 将来 Firebase / Supabase / REST API へ差し替え可能。

(function (global) {
  'use strict';

  // ---- TaskRepository (interface) ---------------------------------------
  // list()                : Promise<Task[]>
  // add(text)             : Promise<Task>
  // complete(id)          : Promise<void>
  // remove(id)            : Promise<void>
  // subscribe(callback)   : () => void   // unsubscribe fn
  // -----------------------------------------------------------------------

  const STORAGE_KEY = 'task-board:tasks';
  const CHANNEL_NAME = 'task-board:sync';

  function newId() {
    return 'task_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  function nowIso() {
    return new Date().toISOString();
  }

  class LocalStorageTaskRepository {
    constructor() {
      this._bc = (typeof BroadcastChannel !== 'undefined')
        ? new BroadcastChannel(CHANNEL_NAME)
        : null;
    }

    async list() {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }

    async add(text) {
      const trimmed = String(text || '').trim();
      if (!trimmed) throw new Error('タスク本文は必須です');

      const tasks = await this.list();
      const maxOrder = tasks.reduce(
        (m, t) => Math.max(m, Number(t.displayOrder) || 0),
        0
      );
      const task = {
        id: newId(),
        text: trimmed,
        status: 'active',
        createdAt: nowIso(),
        completedAt: null,
        displayOrder: maxOrder + 1,
      };
      tasks.push(task);
      await this._save(tasks);
      return task;
    }

    async complete(id) {
      const tasks = await this.list();
      const target = tasks.find((t) => t.id === id);
      if (!target) return;
      target.status = 'done';
      target.completedAt = nowIso();
      await this._save(tasks);
    }

    async remove(id) {
      const tasks = await this.list();
      const filtered = tasks.filter((t) => t.id !== id);
      await this._save(filtered);
    }

    subscribe(callback) {
      const onStorage = (e) => {
        if (e.key === STORAGE_KEY) callback();
      };
      window.addEventListener('storage', onStorage);

      let onMsg = null;
      if (this._bc) {
        onMsg = (e) => {
          if (e && e.data && e.data.type === 'tasks-changed') callback();
        };
        this._bc.addEventListener('message', onMsg);
      }

      return () => {
        window.removeEventListener('storage', onStorage);
        if (this._bc && onMsg) this._bc.removeEventListener('message', onMsg);
      };
    }

    async _save(tasks) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
      if (this._bc) this._bc.postMessage({ type: 'tasks-changed' });
    }
  }

  // 公開
  global.TaskBoard = global.TaskBoard || {};
  global.TaskBoard.repo = new LocalStorageTaskRepository();
  global.TaskBoard.LocalStorageTaskRepository = LocalStorageTaskRepository;
})(window);
