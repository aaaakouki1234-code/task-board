// URL-based space ID — replaces auth.
// Each "space" is a private task list identified by a random ID
// embedded in the URL as ?u=<id>. Anyone with the URL can read/write
// (Google-Docs-unlisted-link model). Security relies on the
// unguessability of a 128-bit random ID.

const STORAGE_KEY = "task-board:spaceId";
const PARAM = "u";
const MIN_LEN = 16;

function generateId() {
  // 16 bytes -> 22 chars base64url (no padding)
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function isValid(id) {
  return typeof id === "string" && id.length >= MIN_LEN && /^[A-Za-z0-9_-]+$/.test(id);
}

// Read spaceId from current URL.
export function readFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get(PARAM);
  return isValid(id) ? id : null;
}

// Read spaceId from localStorage (last visited).
export function readFromStorage() {
  const id = localStorage.getItem(STORAGE_KEY);
  return isValid(id) ? id : null;
}

export function saveToStorage(id) {
  if (isValid(id)) localStorage.setItem(STORAGE_KEY, id);
}

// Update current URL to include ?u=<id> without reloading.
export function syncUrl(id) {
  const url = new URL(window.location.href);
  if (url.searchParams.get(PARAM) === id) return;
  url.searchParams.set(PARAM, id);
  window.history.replaceState({}, "", url.toString());
}

// Resolve spaceId on the admin page: URL > storage > generate-new.
// Always returns a valid id and ensures URL & storage are in sync.
export function resolveOrCreate() {
  let id = readFromUrl();
  if (id) {
    saveToStorage(id);
    return { id, source: "url" };
  }
  id = readFromStorage();
  if (id) {
    syncUrl(id);
    return { id, source: "storage" };
  }
  id = generateId();
  saveToStorage(id);
  syncUrl(id);
  return { id, source: "new" };
}

// Resolve spaceId on the board page: URL > storage. Never auto-creates.
// Returns null if neither source is available.
export function resolveExisting() {
  const fromUrl = readFromUrl();
  if (fromUrl) {
    saveToStorage(fromUrl);
    return fromUrl;
  }
  const fromStorage = readFromStorage();
  if (fromStorage) {
    syncUrl(fromStorage);
    return fromStorage;
  }
  return null;
}

// Build a shareable URL for a given page (admin/board) with the spaceId.
export function shareUrl(spaceId, page = "admin") {
  const url = new URL(window.location.origin + window.location.pathname);
  if (page === "board") {
    // From admin: replace pathname with /board/
    url.pathname = url.pathname.replace(/[^/]*$/, "") + "board/";
  } else if (page === "admin") {
    // From board: replace /board/ with /
    url.pathname = url.pathname.replace(/board\/?$/, "");
    if (!url.pathname.endsWith("/")) url.pathname += "/";
  }
  url.searchParams.set(PARAM, spaceId);
  return url.toString();
}
