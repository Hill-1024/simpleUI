import { toRef } from "vue";
import { useAppStore } from "../stores/appStore.js";

export function useAppBindings() {
  const store = useAppStore();
  const refs = {};
  const actions = {};
  for (const key of Object.keys(store)) {
    if (key.startsWith("$")) continue;
    if (typeof store[key] === "function") actions[key] = store[key];
    else refs[key] = toRef(store, key);
  }
  return { ...refs, ...actions };
}
