import { ref, watch, onMounted } from "vue";

const THEME_KEY = "simpleui-theme";
const VALID = new Set(["light", "dark", "auto"]);

const preference = ref(readStoredPreference());
const resolved = ref(resolveTheme(preference.value));

function readStoredPreference() {
  if (typeof window === "undefined") return "auto";
  try {
    const value = window.localStorage.getItem(THEME_KEY);
    return VALID.has(value) ? value : "auto";
  } catch {
    return "auto";
  }
}

function systemDark() {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function resolveTheme(pref) {
  if (pref === "auto") return systemDark() ? "dark" : "light";
  return pref;
}

function apply(theme) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  const color = theme === "dark" ? "#0E1513" : "#F4FBF8";
  if (meta) {
    meta.setAttribute("content", color);
  } else {
    const tag = document.createElement("meta");
    tag.name = "theme-color";
    tag.content = color;
    document.head.appendChild(tag);
  }
}

let mediaSubscribed = false;

function subscribeMedia() {
  if (mediaSubscribed || typeof window === "undefined" || !window.matchMedia) return;
  mediaSubscribed = true;
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const handler = () => {
    if (preference.value === "auto") {
      resolved.value = systemDark() ? "dark" : "light";
    }
  };
  if (media.addEventListener) {
    media.addEventListener("change", handler);
  } else if (media.addListener) {
    media.addListener(handler);
  }
}

watch(
  preference,
  (value) => {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(THEME_KEY, value);
      } catch {
        /* ignore */
      }
    }
    resolved.value = resolveTheme(value);
  },
  { immediate: false }
);

watch(
  resolved,
  (value) => apply(value),
  { immediate: true }
);

export function useTheme() {
  onMounted(subscribeMedia);

  function setPreference(next) {
    if (!VALID.has(next)) return;
    preference.value = next;
  }

  function toggle() {
    preference.value = resolved.value === "dark" ? "light" : "dark";
  }

  return {
    preference,
    theme: resolved,
    isDark: () => resolved.value === "dark",
    setPreference,
    toggle
  };
}

export function initTheme() {
  apply(resolved.value);
  subscribeMedia();
}
