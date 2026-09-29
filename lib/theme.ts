/** Theme preference, shared by the pre-paint script and the toggle. Mirrors Kakau Notes (Chirpy):
 *  an explicit choice is stored and written to <html data-mode>, no choice follows the system. */
export const themeModes = ["light", "dark", "system"] as const;
export type ThemeMode = (typeof themeModes)[number];
export const THEME_STORAGE_KEY = "mode";

export function readStoredTheme(): ThemeMode {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

const CHANGE_EVENT = "kakau-theme-change";

/** Lets every toggle on the page, and other tabs, re-read the stored choice. */
export function subscribeTheme(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function applyTheme(mode: ThemeMode) {
  const root = document.documentElement;
  if (mode === "system") root.removeAttribute("data-mode");
  else root.setAttribute("data-mode", mode);
  try {
    if (mode === "system") window.localStorage.removeItem(THEME_STORAGE_KEY);
    else window.localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    /* Storage can be blocked (private mode); the choice then lasts for the page only. */
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Runs inline in <head> before first paint so a stored choice never flashes the wrong theme. */
export const themeInitScript = `try{var m=localStorage.getItem("${THEME_STORAGE_KEY}");if(m==="light"||m==="dark")document.documentElement.setAttribute("data-mode",m)}catch(e){}`;
