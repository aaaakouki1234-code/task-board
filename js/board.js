// Board page logic — seamless infinite horizontal scroll
(function () {
  'use strict';

  const { repo, settings } = window.TaskBoard;

  const $board = document.getElementById('board');
  const $fullscreenBtn = document.getElementById('fullscreen-btn');

  let currentSettings = settings.load();
  let lastTaskSignature = '';

  // ---- helpers ----
  function hexToRgb(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!m) return '255,176,0';
    return `${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)}`;
  }

  function applyStyleVars(s) {
    const root = document.documentElement;
    root.style.setProperty('--board-color', s.color);
    root.style.setProperty('--board-size', s.fontSize + 'px');
    root.style.setProperty('--glow-rgb', hexToRgb(s.color));
  }

  function buildSignature(tasks) {
    return tasks
      .filter((t) => t.status === 'active')
      .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0))
      .map((t) => t.id + ':' + t.text)
      .join('|');
  }

  function updateAnimationDuration(track, copyEl) {
    const copyWidth = copyEl.offsetWidth;
    if (copyWidth <= 0) return;
    const duration = copyWidth / Math.max(currentSettings.speed, 1);
    track.style.animationDuration = duration.toFixed(2) + 's';
  }

  // ---- render ----
  function renderIdle() {
    $board.innerHTML = '<div class="idle">――― TASK BOARD ―――</div>';
  }

  function renderTasks(tasks) {
    const active = tasks
      .filter((t) => t.status === 'active')
      .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));

    if (active.length === 0) {
      lastTaskSignature = '';
      renderIdle();
      return;
    }

    const sep = currentSettings.separator || '　🆙　';
    const baseText = active.map((t) => t.text).join(sep) + sep;

    const track = document.createElement('div');
    track.className = 'track';

    const copy1 = document.createElement('span');
    copy1.className = 'copy';
    copy1.textContent = baseText;
    track.appendChild(copy1);
    $board.replaceChildren(track);

    // Ensure each "copy" is at least as wide as viewport for seamless feel
    requestAnimationFrame(() => {
      const vw = window.innerWidth;
      let copyWidth = copy1.offsetWidth;
      if (copyWidth > 0 && copyWidth < vw) {
        const repeats = Math.ceil(vw / copyWidth) + 1;
        copy1.textContent = baseText.repeat(repeats);
      }

      // Append a clone for seamless looping
      const copy2 = copy1.cloneNode(true);
      copy2.setAttribute('aria-hidden', 'true');
      track.appendChild(copy2);

      updateAnimationDuration(track, copy1);
    });
  }

  async function refreshTasks() {
    const tasks = await repo.list();
    const sig = buildSignature(tasks);
    if (sig === lastTaskSignature) return;
    lastTaskSignature = sig;
    renderTasks(tasks);
  }

  // Settings change: update CSS vars (no re-render of content),
  // but speed/font-size affect width so recompute duration.
  function onSettingsChanged(newSettings) {
    const speedChanged = newSettings.speed !== currentSettings.speed;
    const sizeChanged = newSettings.fontSize !== currentSettings.fontSize;
    const colorChanged = newSettings.color !== currentSettings.color;
    const sepChanged = newSettings.separator !== currentSettings.separator;

    currentSettings = newSettings;
    applyStyleVars(currentSettings);

    if (sepChanged) {
      // Separator changed → rebuild content
      lastTaskSignature = '';
      refreshTasks();
      return;
    }

    if (sizeChanged || speedChanged) {
      // Size changes width; recompute duration after layout settles
      const track = $board.querySelector('.track');
      const firstCopy = $board.querySelector('.copy');
      if (track && firstCopy) {
        requestAnimationFrame(() => updateAnimationDuration(track, firstCopy));
      }
    }
    // colorChanged is handled purely via CSS var
    void colorChanged;
  }

  // ---- Fullscreen / controls UX ----
  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      const el = document.documentElement;
      const req = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen;
      if (req) req.call(el).catch(() => {});
    } else {
      const exit = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen;
      if (exit) exit.call(document).catch(() => {});
    }
  }

  function togglePause() {
    const track = $board.querySelector('.track');
    if (!track) return;
    track.classList.toggle('paused');
  }

  let hideTimer = null;
  function showControls() {
    document.body.classList.add('show-controls', 'show-cursor');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      document.body.classList.remove('show-controls', 'show-cursor');
    }, 2500);
  }

  // ---- init ----
  function init() {
    applyStyleVars(currentSettings);
    refreshTasks();

    repo.subscribe(refreshTasks);
    settings.subscribe(onSettingsChanged);

    // Recompute duration on resize (font px-relative width can change)
    let resizeTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        // Force rebuild for proper width-based copy expansion
        lastTaskSignature = '';
        refreshTasks();
      }, 200);
    });

    // Controls
    $fullscreenBtn.addEventListener('click', toggleFullscreen);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'f' || e.key === 'F') {
        toggleFullscreen();
      } else if (e.key === ' ') {
        e.preventDefault();
        togglePause();
      }
      showControls();
    });

    document.addEventListener('mousemove', showControls);
    document.addEventListener('touchstart', showControls, { passive: true });

    showControls(); // brief hint on load
  }

  init();
})();
