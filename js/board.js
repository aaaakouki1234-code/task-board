// Board page — seamless infinite horizontal scroll, gated by URL spaceId.

import * as settingsApi from "./settings.js";
import * as space from "./space.js";
import { FirestoreTaskRepository } from "./firestore-repo.js";

const $board = document.getElementById("board");
const $fullscreenBtn = document.getElementById("fullscreen-btn");
const $backBtn = document.getElementById("back-btn");

// Capture pre-load storage state so we can tell the owner (who has the
// spaceId already saved on this device) from a recipient who opened a
// shared link on a fresh device. Recipients lose the "管理画面" button.
const previouslyStoredId = space.readFromStorage();

let repo = null;
let unsubRepo = null;
let currentSettings = settingsApi.load();
let lastTaskSignature = null;

// ---- helpers ----
function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return "255,176,0";
  return `${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)}`;
}

function applyStyleVars(s) {
  const root = document.documentElement;
  root.style.setProperty("--board-color", s.color);
  root.style.setProperty("--board-size", s.fontSize + "px");
  root.style.setProperty("--glow-rgb", hexToRgb(s.color));
  root.style.setProperty("--rows", String(clampRows(s.rows)));
  root.style.setProperty("--bg-color", s.bgColor || "#000000");
}

function clampRows(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 1;
  return Math.max(1, Math.min(4, Math.round(v)));
}

function applyDirection(s) {
  const dir = s.direction || "left";
  document.body.dataset.direction = dir;
  document.body.dataset.alternate = s.alternate ? "true" : "false";
}

function isVertical(dir) {
  return dir === "up" || dir === "down";
}

function buildSignature(tasks) {
  return tasks
    .filter((t) => t.status === "active")
    .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0))
    .map((t) => t.id + ":" + t.text)
    .join("|");
}

function updateAnimationDuration(track, copyEl, rowIndex = 0, totalRows = 1) {
  const vertical = isVertical(currentSettings.direction);
  const length = vertical ? copyEl.offsetHeight : copyEl.offsetWidth;
  if (length <= 0) return;
  const duration = length / Math.max(currentSettings.speed, 1);
  track.style.animationDuration = duration.toFixed(2) + "s";
  // Stagger phases so multi-row scrolls don't all line up.
  if (totalRows > 1) {
    const offset = -(rowIndex / totalRows) * duration;
    track.style.animationDelay = offset.toFixed(2) + "s";
  } else {
    track.style.animationDelay = "0s";
  }
}

function refreshAllDurations() {
  const rows = $board.querySelectorAll(".row");
  const total = rows.length;
  rows.forEach((row, i) => {
    const track = row.querySelector(".track");
    const copy = row.querySelector(".copy");
    if (track && copy) {
      requestAnimationFrame(() => updateAnimationDuration(track, copy, i, total));
    }
  });
}

// ---- render ----
function renderIdle(message, sub) {
  const small = sub ? `<small>${sub}</small>` : "";
  $board.innerHTML = `<div class="idle">${message}${small}</div>`;
}

function buildRow(baseText, rowIndex, totalRows) {
  const row = document.createElement("div");
  row.className = "row";
  row.dataset.rowIndex = String(rowIndex);
  if (rowIndex % 2 === 1) row.classList.add("row-odd");

  const track = document.createElement("div");
  track.className = "track";

  const copy1 = document.createElement("span");
  copy1.className = "copy";
  copy1.textContent = baseText;
  track.appendChild(copy1);
  row.appendChild(track);

  // Defer measurement until inserted in DOM
  requestAnimationFrame(() => {
    const vertical = isVertical(currentSettings.direction);
    const viewLen = vertical ? window.innerHeight : window.innerWidth;
    let copyLen = vertical ? copy1.offsetHeight : copy1.offsetWidth;
    if (copyLen > 0 && copyLen < viewLen) {
      const repeats = Math.ceil(viewLen / copyLen) + 1;
      copy1.textContent = baseText.repeat(repeats);
    }
    const copy2 = copy1.cloneNode(true);
    copy2.setAttribute("aria-hidden", "true");
    track.appendChild(copy2);
    updateAnimationDuration(track, copy1, rowIndex, totalRows);
  });

  return row;
}

function renderTasks(tasks) {
  const active = tasks
    .filter((t) => t.status === "active")
    .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));

  if (active.length === 0) {
    lastTaskSignature = null;
    renderIdle("――― TASK BOARD ―――", "管理画面からタスクを追加してください");
    return;
  }

  const sep = currentSettings.separator || "　↑　";
  const baseText = active.map((t) => t.text).join(sep) + sep;
  const totalRows = clampRows(currentSettings.rows);

  const frag = document.createDocumentFragment();
  for (let i = 0; i < totalRows; i++) {
    frag.appendChild(buildRow(baseText, i, totalRows));
  }
  $board.replaceChildren(frag);
}

async function refreshTasks() {
  if (!repo) return;
  try {
    const tasks = await repo.list();
    const sig = buildSignature(tasks);
    if (sig === lastTaskSignature) return;
    lastTaskSignature = sig;
    renderTasks(tasks);
  } catch (err) {
    console.error(err);
    renderIdle("読み込みエラー", String(err.code || err.message || err));
  }
}

function onSettingsChanged(newSettings) {
  const speedChanged = newSettings.speed !== currentSettings.speed;
  const sizeChanged = newSettings.fontSize !== currentSettings.fontSize;
  const sepChanged = newSettings.separator !== currentSettings.separator;
  const dirChanged = newSettings.direction !== currentSettings.direction;
  const rowsChanged = clampRows(newSettings.rows) !== clampRows(currentSettings.rows);
  const altChanged = newSettings.alternate !== currentSettings.alternate;

  currentSettings = newSettings;
  applyStyleVars(currentSettings);
  applyDirection(currentSettings);

  if (sepChanged || dirChanged || rowsChanged || altChanged) {
    // These changes require a full re-layout.
    lastTaskSignature = null;
    refreshTasks();
    return;
  }
  if (sizeChanged || speedChanged) {
    refreshAllDurations();
  }
}

// ---- Fullscreen / controls UX ----
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    const el = document.documentElement;
    const req =
      el.requestFullscreen ||
      el.webkitRequestFullscreen ||
      el.mozRequestFullScreen;
    if (req) req.call(el).catch(() => {});
  } else {
    const exit =
      document.exitFullscreen ||
      document.webkitExitFullscreen ||
      document.mozCancelFullScreen;
    if (exit) exit.call(document).catch(() => {});
  }
}

function togglePause() {
  const track = $board.querySelector(".track");
  if (!track) return;
  track.classList.toggle("paused");
}

let hideTimer = null;
function showControls() {
  document.body.classList.add("show-controls", "show-cursor");
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    document.body.classList.remove("show-controls", "show-cursor");
  }, 2500);
}

// ---- Pinch / wheel resize ----
const SIZE_MIN = 24;
const SIZE_MAX = 320;
let pinchStartDist = 0;
let pinchStartSize = 0;
let pinchSaveTimer = null;

function clampSize(px) {
  return Math.max(SIZE_MIN, Math.min(SIZE_MAX, Math.round(px)));
}

function setLiveSize(px) {
  const next = clampSize(px);
  if (next === currentSettings.fontSize) return;
  currentSettings.fontSize = next;
  document.documentElement.style.setProperty("--board-size", next + "px");
  refreshAllDurations();
  // Debounce persistence so we don't hammer localStorage during a pinch.
  clearTimeout(pinchSaveTimer);
  pinchSaveTimer = setTimeout(() => {
    settingsApi.save({ fontSize: currentSettings.fontSize });
  }, 200);
}

function distanceBetween(t1, t2) {
  const dx = t1.clientX - t2.clientX;
  const dy = t1.clientY - t2.clientY;
  return Math.hypot(dx, dy);
}

function onTouchStart(e) {
  if (e.touches.length === 2) {
    pinchStartDist = distanceBetween(e.touches[0], e.touches[1]);
    pinchStartSize = currentSettings.fontSize;
    e.preventDefault();
  }
}

function onTouchMove(e) {
  if (e.touches.length === 2 && pinchStartDist > 0) {
    const dist = distanceBetween(e.touches[0], e.touches[1]);
    const scale = dist / pinchStartDist;
    setLiveSize(pinchStartSize * scale);
    e.preventDefault();
  }
}

function onTouchEnd(e) {
  if (e.touches.length < 2) {
    pinchStartDist = 0;
  }
}

function onWheel(e) {
  // Ctrl+wheel (or pinch on trackpad which fires ctrlKey) → resize
  if (!e.ctrlKey) return;
  e.preventDefault();
  const delta = -e.deltaY;
  const factor = 1 + delta * 0.005;
  setLiveSize(currentSettings.fontSize * factor);
}

// ---- init ----
function init() {
  applyStyleVars(currentSettings);
  applyDirection(currentSettings);

  const spaceId = space.resolveExisting();
  if (!spaceId) {
    renderIdle(
      "──── URL を確認してください ────",
      "管理画面で URL を取得してから開いてください",
    );
    return;
  }

  // Hide "管理画面" button for shared-link recipients (those whose
  // localStorage didn't already contain this spaceId before page load).
  const isOwner = previouslyStoredId === spaceId;
  if (!isOwner && $backBtn) {
    $backBtn.hidden = true;
  }

  repo = new FirestoreTaskRepository(spaceId);
  renderIdle("...", "");
  unsubRepo = repo.subscribe(refreshTasks);
  refreshTasks();

  settingsApi.subscribe(onSettingsChanged);

  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      lastTaskSignature = null;
      refreshTasks();
    }, 200);
  });

  $fullscreenBtn.addEventListener("click", toggleFullscreen);

  document.addEventListener("keydown", (e) => {
    if (e.key === "f" || e.key === "F") {
      toggleFullscreen();
    } else if (e.key === " ") {
      e.preventDefault();
      togglePause();
    }
    showControls();
  });

  document.addEventListener("mousemove", showControls);
  document.addEventListener("touchstart", showControls, { passive: true });

  // Pinch / Ctrl+wheel to resize the running text.
  $board.addEventListener("touchstart", onTouchStart, { passive: false });
  $board.addEventListener("touchmove", onTouchMove, { passive: false });
  $board.addEventListener("touchend", onTouchEnd);
  $board.addEventListener("touchcancel", onTouchEnd);
  $board.addEventListener("wheel", onWheel, { passive: false });

  showControls();
}

init();
