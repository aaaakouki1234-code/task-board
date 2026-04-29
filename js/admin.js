// Admin page — URL-based space ID + Firestore tasks + per-device display settings.
// First visit (no spaceId in URL or storage) shows a welcome screen with a
// "新しいURLを発行する" button that creates the ID and reloads with ?u=<id>.

import * as settingsApi from "./settings.js";
import * as space from "./space.js";
import { FirestoreTaskRepository } from "./firestore-repo.js";

// ---- Welcome ----
const $welcome = document.getElementById("welcome-card");
const $createBtn = document.getElementById("create-button");
const $mainUI = document.getElementById("main-ui");
const $headerActions = document.getElementById("header-actions");

// ---- Tasks ----
const $form = document.getElementById("add-form");
const $input = document.getElementById("add-input");
const $button = document.getElementById("add-button");
const $list = document.getElementById("task-list");
const $countActive = document.getElementById("task-count-active");
const $countDone = document.getElementById("task-count-done");
const $tabActive = document.getElementById("tab-active");
const $tabDone = document.getElementById("tab-done");
const $stats = document.getElementById("task-stats");
const $listFooter = document.getElementById("task-list-footer");
const $clearCompletedBtn = document.getElementById("clear-completed-button");
const $toast = document.getElementById("toast");

const $shareBtn = document.getElementById("share-button");
const $boardBtn = document.getElementById("board-button");

const $speed = document.getElementById("speed-input");
const $speedValue = document.getElementById("speed-value");
const $size = document.getElementById("size-input");
const $sizeValue = document.getElementById("size-value");
const $presets = document.getElementById("color-presets");
const $directionPicker = document.getElementById("direction-picker");
const $rowsPicker = document.getElementById("rows-picker");
const $alternate = document.getElementById("alternate-input");
const $bgColor = document.getElementById("bg-color-input");
const $bgColorReset = document.getElementById("bg-color-reset");
const $preview = document.getElementById("preview-text");
const $reset = document.getElementById("reset-button");

let repo = null;
let allTasks = [];
let currentTab = "active";

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

function fmtTimeFull(iso) {
  try {
    const d = new Date(iso);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${y}/${m}/${day} ${hh}:${mm}`;
  } catch {
    return "";
  }
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function renderStats(tasks) {
  const todayStart = startOfToday();
  let doneToday = 0;
  let doneTotal = 0;
  for (const t of tasks) {
    if (t.status !== "done" || !t.completedAt) continue;
    doneTotal++;
    const ts = new Date(t.completedAt).getTime();
    if (ts >= todayStart) doneToday++;
  }
  if (doneTotal === 0) {
    $stats.hidden = true;
    return;
  }
  $stats.hidden = false;
  $stats.textContent = `今日の完了: ${doneToday} 件 ／ 累計: ${doneTotal} 件`;
}

function buildActionBtn(label, className, ariaLabel, onClick) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn-icon " + className;
  btn.textContent = label;
  if (ariaLabel) btn.setAttribute("aria-label", ariaLabel);
  btn.addEventListener("click", onClick);
  return btn;
}

function renderActiveItem(task, index, total) {
  const li = document.createElement("li");
  li.className = "task-item";
  li.dataset.id = task.id;

  const main = document.createElement("div");
  main.className = "task-main";

  const text = document.createElement("div");
  text.className = "task-text";
  text.textContent = task.text;
  text.title = "クリックで編集";
  text.addEventListener("click", () => beginEdit(li, task));

  const meta = document.createElement("div");
  meta.className = "task-meta";
  meta.textContent = "追加: " + fmtTime(task.createdAt);

  main.appendChild(text);
  main.appendChild(meta);

  const actions = document.createElement("div");
  actions.className = "task-actions";

  const upBtn = buildActionBtn("▲", "btn-move", `「${task.text}」を上へ`, () => onMoveUp(task.id));
  upBtn.disabled = index === 0;
  const downBtn = buildActionBtn("▼", "btn-move", `「${task.text}」を下へ`, () => onMoveDown(task.id));
  downBtn.disabled = index === total - 1;
  const completeBtn = buildActionBtn("完了", "btn-complete", null, () => onComplete(task.id));
  const deleteBtn = buildActionBtn("削除", "btn-delete", `「${task.text}」を削除`, () => onDelete(task.id, task.text));

  actions.appendChild(upBtn);
  actions.appendChild(downBtn);
  actions.appendChild(completeBtn);
  actions.appendChild(deleteBtn);

  li.appendChild(main);
  li.appendChild(actions);
  return li;
}

function renderDoneItem(task) {
  const li = document.createElement("li");
  li.className = "task-item task-item-done";
  li.dataset.id = task.id;

  const main = document.createElement("div");
  main.className = "task-main";

  const text = document.createElement("div");
  text.className = "task-text task-text-done";
  text.textContent = task.text;

  const meta = document.createElement("div");
  meta.className = "task-meta";
  meta.textContent = "完了: " + fmtTimeFull(task.completedAt || task.createdAt);

  main.appendChild(text);
  main.appendChild(meta);

  const actions = document.createElement("div");
  actions.className = "task-actions";
  actions.appendChild(
    buildActionBtn("戻す", "btn-restore", `「${task.text}」を未完了に戻す`, () => onRestore(task.id)),
  );
  actions.appendChild(
    buildActionBtn("削除", "btn-delete", `「${task.text}」を削除`, () => onDelete(task.id, task.text)),
  );

  li.appendChild(main);
  li.appendChild(actions);
  return li;
}

function beginEdit(li, task) {
  const $textEl = li.querySelector(".task-text");
  if (!$textEl || $textEl.dataset.editing === "1") return;
  $textEl.dataset.editing = "1";

  const input = document.createElement("input");
  input.type = "text";
  input.value = task.text;
  input.maxLength = 200;
  input.className = "task-edit-input";

  const commit = async () => {
    const next = input.value.trim();
    if (!next || next === task.text) {
      $textEl.textContent = task.text;
      delete $textEl.dataset.editing;
      return;
    }
    try {
      await repo.updateText(task.id, next);
      toast("更新しました");
    } catch (err) {
      toast(err.message || "更新に失敗しました");
      $textEl.textContent = task.text;
    } finally {
      delete $textEl.dataset.editing;
    }
  };

  const cancel = () => {
    $textEl.textContent = task.text;
    delete $textEl.dataset.editing;
  };

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); input.blur(); }
    else if (e.key === "Escape") { e.preventDefault(); cancel(); }
  });
  input.addEventListener("blur", commit);

  $textEl.replaceChildren(input);
  input.focus();
  input.select();
}

function renderList(tasks) {
  allTasks = tasks;
  const active = tasks
    .filter((t) => t.status === "active")
    .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));
  const done = tasks
    .filter((t) => t.status === "done")
    .sort((a, b) => {
      const ta = new Date(a.completedAt || 0).getTime();
      const tb = new Date(b.completedAt || 0).getTime();
      return tb - ta; // newest completion first
    });

  $countActive.textContent = active.length ? `（${active.length}）` : "";
  $countDone.textContent = done.length ? `（${done.length}）` : "";

  renderStats(tasks);

  $listFooter.hidden = !(currentTab === "done" && done.length > 0);

  const showing = currentTab === "active" ? active : done;
  if (showing.length === 0) {
    const msg = currentTab === "active"
      ? "未完了タスクはありません"
      : "完了済みタスクはまだありません";
    $list.innerHTML = `<li class="task-empty">${msg}</li>`;
    return;
  }

  const frag = document.createDocumentFragment();
  if (currentTab === "active") {
    showing.forEach((task, i) => frag.appendChild(renderActiveItem(task, i, showing.length)));
  } else {
    showing.forEach((task) => frag.appendChild(renderDoneItem(task)));
  }
  $list.replaceChildren(frag);
}

function selectTab(tab) {
  if (tab !== "active" && tab !== "done") return;
  currentTab = tab;
  $tabActive.classList.toggle("active", tab === "active");
  $tabDone.classList.toggle("active", tab === "done");
  $tabActive.setAttribute("aria-selected", String(tab === "active"));
  $tabDone.setAttribute("aria-selected", String(tab === "done"));
  renderList(allTasks);
}

async function refresh() {
  if (!repo) return;
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
  if (!repo) return;
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
  if (!repo) return;
  try {
    await repo.complete(id);
    toast("完了にしました");
  } catch {
    toast("完了処理に失敗しました");
  }
}

async function onDelete(id, text) {
  if (!repo) return;
  if (!window.confirm(`「${text}」を削除しますか？`)) return;
  try {
    await repo.remove(id);
    toast("削除しました");
  } catch {
    toast("削除に失敗しました");
  }
}

async function onRestore(id) {
  if (!repo) return;
  try {
    await repo.restore(id);
    toast("未完了に戻しました");
  } catch {
    toast("戻すのに失敗しました");
  }
}

function getActiveSorted() {
  return allTasks
    .filter((t) => t.status === "active")
    .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));
}

async function onMoveUp(id) {
  if (!repo) return;
  const list = getActiveSorted();
  const idx = list.findIndex((t) => t.id === id);
  if (idx <= 0) return;
  const a = list[idx];
  const b = list[idx - 1];
  try {
    await repo.swapOrder(a.id, a.displayOrder, b.id, b.displayOrder);
  } catch {
    toast("並べ替えに失敗しました");
  }
}

async function onMoveDown(id) {
  if (!repo) return;
  const list = getActiveSorted();
  const idx = list.findIndex((t) => t.id === id);
  if (idx === -1 || idx >= list.length - 1) return;
  const a = list[idx];
  const b = list[idx + 1];
  try {
    await repo.swapOrder(a.id, a.displayOrder, b.id, b.displayOrder);
  } catch {
    toast("並べ替えに失敗しました");
  }
}

async function onClearCompleted() {
  if (!repo) return;
  const doneCount = allTasks.filter((t) => t.status === "done").length;
  if (doneCount === 0) return;
  if (!window.confirm(`完了済みタスク ${doneCount} 件をすべて削除しますか？\nこの操作は取り消せません。`)) return;
  try {
    const removed = await repo.clearCompleted();
    toast(`${removed} 件を削除しました`);
  } catch {
    toast("一括削除に失敗しました");
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
  const sid = space.readFromUrl() || space.readFromStorage();
  if (!sid) return;
  const url = space.shareUrl(sid, "board");
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

function renderDirections(currentDirection) {
  const frag = document.createDocumentFragment();
  for (const d of settingsApi.DIRECTIONS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "direction-btn";
    btn.textContent = d.icon;
    btn.title = d.label;
    btn.setAttribute("aria-label", d.label);
    btn.setAttribute("aria-pressed", String(d.value === currentDirection));
    btn.addEventListener("click", () => onDirectionChange(d.value));
    frag.appendChild(btn);
  }
  $directionPicker.replaceChildren(frag);
}

function renderRows(currentRows) {
  const frag = document.createDocumentFragment();
  for (let n = 1; n <= 4; n++) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "rows-btn";
    btn.textContent = String(n);
    btn.title = `${n} 行 / 列`;
    btn.setAttribute("aria-label", `${n} 行または ${n} 列に分割`);
    btn.setAttribute("aria-pressed", String(n === currentRows));
    btn.addEventListener("click", () => onRowsChange(n));
    frag.appendChild(btn);
  }
  $rowsPicker.replaceChildren(frag);
}

function loadSettingsToUI(s) {
  $speed.value = s.speed;
  $speedValue.textContent = s.speed;
  $size.value = s.fontSize;
  $sizeValue.textContent = s.fontSize;
  renderPresets(s.color);
  renderDirections(s.direction);
  renderRows(s.rows);
  $alternate.checked = !!s.alternate;
  $bgColor.value = s.bgColor || "#000000";
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

function onDirectionChange(value) {
  const s = settingsApi.save({ direction: value });
  renderDirections(s.direction);
}

function onRowsChange(value) {
  const s = settingsApi.save({ rows: value });
  renderRows(s.rows);
}

function onAlternateChange() {
  settingsApi.save({ alternate: $alternate.checked });
}

function onBgColorChange() {
  settingsApi.save({ bgColor: $bgColor.value });
}

function onBgColorReset() {
  $bgColor.value = "#000000";
  settingsApi.save({ bgColor: "#000000" });
}

function onReset() {
  if (!window.confirm("表示設定を既定値に戻しますか？")) return;
  const s = settingsApi.reset();
  loadSettingsToUI(s);
  toast("既定値に戻しました");
}

// ---- Init ----
function showWelcome() {
  $welcome.hidden = false;
  $mainUI.hidden = true;
  $headerActions.hidden = true;
  $createBtn.addEventListener("click", () => {
    $createBtn.disabled = true;
    $createBtn.textContent = "発行中…";
    space.createAndNavigate();
  });
}

function bindMainUIEvents() {
  $form.addEventListener("submit", onAdd);
  $shareBtn.addEventListener("click", onShare);
  $boardBtn.addEventListener("click", onOpenBoard);
  loadSettingsToUI(settingsApi.load());
  $speed.addEventListener("input", onSpeedChange);
  $size.addEventListener("input", onSizeChange);
  $alternate.addEventListener("change", onAlternateChange);
  $bgColor.addEventListener("input", onBgColorChange);
  $bgColorReset.addEventListener("click", onBgColorReset);
  $reset.addEventListener("click", onReset);
  $tabActive.addEventListener("click", () => selectTab("active"));
  $tabDone.addEventListener("click", () => selectTab("done"));
  $clearCompletedBtn.addEventListener("click", onClearCompleted);
}

function start(spaceId) {
  $welcome.hidden = true;
  $mainUI.hidden = false;
  $headerActions.hidden = false;
  bindMainUIEvents();
  repo = new FirestoreTaskRepository(spaceId);
  repo.subscribe(refresh);
  refresh();
}

const spaceId = space.resolveExisting();
if (spaceId) {
  start(spaceId);
} else {
  showWelcome();
}
