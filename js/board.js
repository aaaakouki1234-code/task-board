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
}

function buildSignature(tasks) {
  return tasks
    .filter((t) => t.status === "active")
    .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0))
    .map((t) => t.id + ":" + t.text)
    .join("|");
}

function updateAnimationDuration(track, copyEl) {
  const copyWidth = copyEl.offsetWidth;
  if (copyWidth <= 0) return;
  const duration = copyWidth / Math.max(currentSettings.speed, 1);
  track.style.animationDuration = duration.toFixed(2) + "s";
}

// ---- render ----
function renderIdle(message, sub) {
  const small = sub ? `<small>${sub}</small>` : "";
  $board.innerHTML = `<div class="idle">${message}${small}</div>`;
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

  const sep = currentSettings.separator || "　🆙　";
  const baseText = active.map((t) => t.text).join(sep) + sep;

  const track = document.createElement("div");
  track.className = "track";

  const copy1 = document.createElement("span");
  copy1.className = "copy";
  copy1.textContent = baseText;
  track.appendChild(copy1);
  $board.replaceChildren(track);

  requestAnimationFrame(() => {
    const vw = window.innerWidth;
    let copyWidth = copy1.offsetWidth;
    if (copyWidth > 0 && copyWidth < vw) {
      const repeats = Math.ceil(vw / copyWidth) + 1;
      copy1.textContent = baseText.repeat(repeats);
    }
    const copy2 = copy1.cloneNode(true);
    copy2.setAttribute("aria-hidden", "true");
    track.appendChild(copy2);
    updateAnimationDuration(track, copy1);
  });
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

  currentSettings = newSettings;
  applyStyleVars(currentSettings);

  if (sepChanged) {
    lastTaskSignature = null;
    refreshTasks();
    return;
  }
  if (sizeChanged || speedChanged) {
    const track = $board.querySelector(".track");
    const firstCopy = $board.querySelector(".copy");
    if (track && firstCopy) {
      requestAnimationFrame(() => updateAnimationDuration(track, firstCopy));
    }
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

// ---- init ----
function init() {
  applyStyleVars(currentSettings);

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

  showControls();
}

init();
