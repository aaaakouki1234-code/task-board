// Admin page — URL-based space ID + Firestore tasks + per-device display settings.

import * as settingsApi from "./settings.js";
import * as space from "./space.js";
import { FirestoreTaskRepository } from "./firestore-repo.js";

// ---- Elements (tasks/settings) ----
const $form = document.getElementById("add-form");
const $input = document.getElementById("add-input");
const $button = document.getElementById("add-button");
const $list = document.getElementById("task-list");
const $count = document.getElementById("task-count");
const $toast = document.getElementById("toast");

const $shareBtn = document.getElementById("share-button");
const $boardBtn = document.getElementById("board-button");

const $speed = document.getElementById("speed-input");
const $speedValue = document.getElementById("speed-value");
const $size = document.getElementById("size-input");
const $sizeValue = document.getElementById("size-value");
const $presets = document.getElementById("color-presets");
const $preview = document.getElementById("preview-text");
const $reset = document.getElementById("reset-button");

// ---- Resolve space ID + repo ----
const { id: spaceId } = space.resolveOrCreate();
const repo = new FirestoreTaskRepository(spaceId);

// ---- Toast ----
let toastTimer = null;
function toast(msg) {
  $toast.textContent = msg;
  $toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $toast.classList.remove("show"), 1800);
}

// ---- Task list rendering ----
function fmtTime(iso) {
  try {
    const d = new Date(iso);
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${m}/${day} ${hh}:${mm}`;
  } catch {
    return "";
  }
}

function renderList(tasks) {
  const active = tasks
    .filter((t) => t.status === "active")
    .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));

  $count.textContent = active.length ? `（${active.length}）` : "";

  if (active.length === 0) {
    $list.innerHTML = '<li class="task-empty">未完了タスクはありません</li>';
    return;
  }

  const frag = document.createDocumentFragment();
  for (const task of active) {
    const li = document.createElement("li");
    li.className = "task-item";
    li.dataset.id = task.id;

    const main = document.createElement("div");
    main.style.flex = "1 1 auto";
    main.style.minWidth = "0";

    const text = document.createElement("div");
    text.className = "task-text";
    text.textContent = task.text;

    const meta = document.createElement("div");
    meta.className = "task-meta";
    meta.textContent = fmtTime(task.createdAt);

    main.appendChild(text);
    main.appendChild(meta);

    const actions = document.createElement("div");
    actions.className = "task-actions";

    const completeBtn = document.createElement("button");
    completeBtn.type = "button";
    completeBtn.className = "btn-icon btn-complete";
    completeBtn.textContent = "完了";
    completeBtn.addEventListener("click", () => onComplete(task.id));

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "btn-icon btn-delete";
    deleteBtn.textContent = "削除";
    deleteBtn.setAttribute("aria-label", `「${task.text}」を削除`);
    deleteBtn.addEventListener("click", () => onDelete(task.id, task.text));

    actions.appendChild(completeBtn);
    actions.appendChild(deleteBtn);

    li.appendChild(main);
    li.appendChild(actions);
    frag.appendChild(li);
  }
  $list.replaceChildren(frag);
}

async function refresh() {
  try {
    const tasks = await repo.list();
    renderList(tasks);
  } catch (err) {
    console.error(err);
    toast("読み込みに失敗しました");
  }
}

// ---- Task handlers ----
async function onAdd(e) {
  e.preventDefault();
  const value = $input.value.trim();
  if (!value) return;
  $button.disabled = true;
  try {
    await repo.add(value);
    $input.value = "";
    $input.focus();
    toast("追加しました");
  } catch (err) {
    toast(err.message || "追加に失敗しました");
  } finally {
    $button.disabled = false;
  }
}

async function onComplete(id) {
  try {
    await repo.complete(id);
    toast("完了にしました");
  } catch {
    toast("完了処理に失敗しました");
  }
}

async function onDelete(id, text) {
  if (!window.confirm(`「${text}」を削除しますか？`)) return;
  try {
    await repo.remove(id);
    toast("削除しました");
  } catch {
    toast("削除に失敗しました");
  }
}

// ---- Share URL ----
async function onShare() {
  const url = window.location.href;
  try {
    if (navigator.share) {
      await navigator.share({ title: "Task Board", url });
    } else if (navigator.clipboard) {
      await navigator.clipboard.writeText(url);
      toast("URLをコピーしました");
    } else {
      window.prompt("このURLをコピーしてください:", url);
    }
  } catch (err) {
    if (err.name !== "AbortError") {
      window.prompt("このURLをコピーしてください:", url);
    }
  }
}

function onOpenBoard() {
  const url = space.shareUrl(spaceId, "board");
  window.open(url, "_blank", "noopener");
}

// ---- Settings UI ----
function applyPreviewStyle(s) {
  $preview.style.color = s.color;
  $preview.style.fontSize = Math.min(s.fontSize, 64) + "px";
}

function renderPresets(currentColor) {
  const frag = document.createDocumentFragment();
  for (const p of settingsApi.PRESET_COLORS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "color-swatch";
    btn.style.background = p.value;
    btn.title = p.label;
    btn.setAttribute("aria-label", p.label);
    btn.setAttribute(
      "aria-pressed",
      String(p.value.toLowerCase() === currentColor.toLowerCase()),
    );
    btn.addEventListener("click", () => onColorChange(p.value));
    frag.appendChild(btn);
  }
  const picker = document.createElement("input");
  picker.type = "color";
  picker.value = currentColor;
  picker.title = "カスタム色";
  picker.addEventListener("input", (e) => onColorChange(e.target.value));
  frag.appendChild(picker);
  $presets.replaceChildren(frag);
}

function loadSettingsToUI(s) {
  $speed.value = s.speed;
  $speedValue.textContent = s.speed;
  $size.value = s.fontSize;
  $sizeValue.textContent = s.fontSize;
  renderPresets(s.color);
  applyPreviewStyle(s);
}

function onSpeedChange() {
  const v = Number($speed.value);
  $speedValue.textContent = v;
  settingsApi.save({ speed: v });
}

function onSizeChange() {
  const v = Number($size.value);
  $sizeValue.textContent = v;
  const s = settingsApi.save({ fontSize: v });
  applyPreviewStyle(s);
}

function onColorChange(value) {
  const s = settingsApi.save({ color: value });
  renderPresets(s.color);
  applyPreviewStyle(s);
}

function onReset() {
  if (!window.confirm("表示設定を既定値に戻しますか？")) return;
  const s = settingsApi.reset();
  loadSettingsToUI(s);
  toast("既定値に戻しました");
}

// ---- Init ----
function init() {
  $form.addEventListener("submit", onAdd);
  $shareBtn.addEventListener("click", onShare);
  $boardBtn.addEventListener("click", onOpenBoard);

  loadSettingsToUI(settingsApi.load());
  $speed.addEventListener("input", onSpeedChange);
  $size.addEventListener("input", onSizeChange);
  $reset.addEventListener("click", onReset);

  repo.subscribe(refresh);
  refresh();
}

init();
