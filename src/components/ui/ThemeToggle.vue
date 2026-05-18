<script setup>
import { computed } from "vue";
import { Sun, Moon, MonitorCog } from "lucide-vue-next";
import { useTheme } from "../../composables/useTheme.js";

const { preference, theme, setPreference } = useTheme();

const order = ["auto", "light", "dark"];
const labelMap = { auto: "跟随系统", light: "浅色", dark: "深色" };
const iconMap = { auto: MonitorCog, light: Sun, dark: Moon };

const currentIcon = computed(() => {
  if (preference.value === "auto") return MonitorCog;
  return iconMap[theme.value] || Sun;
});

function cycle() {
  const idx = order.indexOf(preference.value);
  const next = order[(idx + 1) % order.length];
  setPreference(next);
}
</script>

<template>
  <button
    type="button"
    class="state-layer relative h-9 w-9 inline-flex items-center justify-center rounded-full text-onSurfaceVariant hover:text-onSurface focus-ring"
    :aria-label="`主题:${labelMap[preference]}`"
    :title="`主题:${labelMap[preference]}`"
    @click="cycle"
  >
    <component :is="currentIcon" :size="17" />
  </button>
</template>
