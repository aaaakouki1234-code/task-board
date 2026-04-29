// Display settings — speed / font size / color
// Stored in localStorage per device (so different devices can use
// different sizes / speeds depending on screen). Synced across tabs
// of the same device via the storage event.

const SETTINGS_KEY = "task-board:settings";

export const DEFAULTS = Object.freeze({
  speed: 120,        // px / sec
  fontSize: 96,      // px
  color: "#FFB000",  // 駅電光掲示板風アンバー
  separator: "　🆙　",
});

export const PRESET_COLORS = [
  { label: "アンバー", value: "#FFB000" },
  { label: "ホワイト", value: "#FFFFFF" },
  { label: "グリーン", value: "#22DD55" },
  { label: "オレンジ", value: "#FF7A00" },
  { label: "レッド",   value: "#FF3344" },
];

export function load() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

export function save(partial) {
  const merged = { ...load(), ...partial };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(merged));
  return merged;
}

export function reset() {
  localStorage.removeItem(SETTINGS_KEY);
  return { ...DEFAULTS };
}

export function subscribe(callback) {
  const onStorage = (e) => {
    if (e.key === SETTINGS_KEY) callback(load());
  };
  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
}
