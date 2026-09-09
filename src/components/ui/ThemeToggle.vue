<script setup>
import { computed } from "vue";
import { Sun, Moon, MonitorCog } from "lucide-vue-next";
import { useTheme } from "../../composables/useTheme.js";

const { preference, theme, setPreference } = useTheme();

const options = [
  { value: "auto", label: "跟随系统", icon: MonitorCog },
  { value: "light", label: "浅色", icon: Sun },
  { value: "dark", label: "深色", icon: Moon }
];
</script>

<template>
  <div
    class="inline-flex items-center gap-0.5 rounded-full p-1 bg-[rgb(var(--md-surface-container-high)/0.6)] border border-[rgb(var(--md-outline-variant)/0.5)] dark:border-white/6"
    role="radiogroup"
    aria-label="主题"
  >
    <button
      v-for="opt in options"
      :key="opt.value"
      type="button"
      role="radio"
      :aria-checked="preference === opt.value"
      :title="opt.label"
      :aria-label="opt.label"
      class="press relative h-7 w-7 grid place-items-center rounded-full transition-colors duration-250 ease-out-soft focus-ring"
      :class="
        preference === opt.value
          ? 'bg-[rgb(var(--md-surface-container-lowest))] text-onSurface shadow-elev-1 dark:bg-[rgb(var(--md-surface-container-highest))]'
          : 'text-onSurfaceVariant hover:text-onSurface'
      "
      @click="setPreference(opt.value)"
    >
      <component :is="opt.icon" :size="14" />
    </button>
  </div>
</template>
