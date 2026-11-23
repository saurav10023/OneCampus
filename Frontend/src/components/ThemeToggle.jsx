import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

// Subscribes to the <html class="dark"> flag so every toggle on the page stays in sync.
const subscribe = (cb) => {
  const o = new MutationObserver(cb);
  o.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => o.disconnect();
};
const getSnapshot = () => document.documentElement.classList.contains("dark");

export function useTheme() {
  const dark = useSyncExternalStore(subscribe, getSnapshot, () => false);
  const toggle = () => {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    try { localStorage.setItem("oc-theme", next ? "dark" : "light"); } catch { /* ignore */ }
  };
  return { dark, toggle };
}

export default function ThemeToggle() {
  const { dark, toggle } = useTheme();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Light mode" : "Dark mode"}
      className="w-10 h-10 rounded-xl flex items-center justify-center text-[color:var(--muted)] hover:bg-[color:var(--inset)] hover:text-[color:var(--ink)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] focus-visible:ring-offset-1"
    >
      {dark ? <Sun className="w-[18px] h-[18px]" aria-hidden="true" /> : <Moon className="w-[18px] h-[18px]" aria-hidden="true" />}
    </button>
  );
}