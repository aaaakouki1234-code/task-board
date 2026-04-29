// Display settings — speed / font size / color
// localStorage に保存。タブをまたいで storage event で同期。

(function (global) {
  'use strict';

  const SETTINGS_KEY = 'task-board:settings';

  const DEFAULTS = Object.freeze({
    speed: 120,        // px / sec
    fontSize: 96,      // px
    color: '#FFB000',  // 駅電光掲示板風アンバー
    separator: '　🆙　',
  });

  const PRESET_COLORS = [
    { label: 'アンバー', value: '#FFB000' },
    { label: 'ホワイト', value: '#FFFFFF' },
    { label: 'グリーン', value: '#22DD55' },
    { label: 'オレンジ', value: '#FF7A00' },
    { label: 'レッド',   value: '#FF3344' },
  ];

  function load() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return { ...DEFAULTS };
      const parsed = JSON.parse(raw);
      return { ...DEFAULTS, ...parsed };
    } catch {
      return { ...DEFAULTS };
    }
  }

  function save(partial) {
    const merged = { ...load(), ...partial };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(merged));
    return merged;
  }

  function reset() {
    localStorage.removeItem(SETTINGS_KEY);
    return { ...DEFAULTS };
  }

  function subscribe(callback) {
    const onStorage = (e) => {
      if (e.key === SETTINGS_KEY) callback(load());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }

  global.TaskBoard = global.TaskBoard || {};
  global.TaskBoard.settings = { load, save, reset, subscribe, DEFAULTS, PRESET_COLORS };
})(window);
