// Persisted player options and progress.
const KEY = 'swiftsword3d';
const defaults = { musicVol: 8, sfxVol: 10, blood: true, difficulty: 1, quality: 'auto', shuraUnlocked: false, seenHelp: false };

export const OPTIONS = (() => {
  const o = Object.assign({}, defaults);
  try {
    if (typeof localStorage !== 'undefined') Object.assign(o, JSON.parse(localStorage.getItem(KEY) || '{}'));
  } catch (e) { /* private mode */ }
  return o;
})();

export function saveOptions() {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify(OPTIONS));
  } catch (e) { /* ignore */ }
}
