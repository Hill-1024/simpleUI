<script setup>
import { computed } from "vue";

const props = defineProps({
  label: { type: String, required: true },
  value: { type: [String, Number], default: "" },
  unit: { type: String, default: "" },
  hint: { type: String, default: "" },
  icon: { type: [Object, Function], default: null },
  trend: { type: String, default: "" },
  trendDirection: { type: String, default: "" },
  accent: { type: String, default: "primary" }
});

const accentTextMap = {
  primary: "text-primary",
  secondary: "text-secondary",
  tertiary: "text-tertiary",
  success: "text-success",
  warning: "text-warning",
  error: "text-error"
};

const accentGlowMap = {
  primary: "bg-primary/12",
  secondary: "bg-secondary/12",
  tertiary: "bg-tertiary/12",
  success: "bg-success/12",
  warning: "bg-warning/12",
  error: "bg-error/12"
};

const accentText = computed(() => accentTextMap[props.accent] || accentTextMap.primary);
const accentGlow = computed(() => accentGlowMap[props.accent] || accentGlowMap.primary);
</script>

<template>
  <article
    class="glass-panel rounded-2xl p-5 flex flex-col gap-3 relative overflow-hidden transition-all duration-350 ease-out-soft hover:-translate-y-0.5 hover:shadow-elev-3"
  >
    <div
      :class="['absolute -top-10 -right-10 h-28 w-28 rounded-full blur-2xl pointer-events-none', accentGlow]"
      aria-hidden="true"
    />
    <div class="relative flex items-start justify-between gap-3">
      <p class="type-eyebrow text-onSurfaceVariant/85 pt-1">{{ label }}</p>
      <span
        v-if="icon"
        :class="['grid place-items-center h-9 w-9 rounded-xl bg-[rgb(var(--md-surface-container-high)/0.6)] border border-[rgb(var(--md-outline-variant)/0.5)] dark:border-white/6', accentText]"
      >
        <component :is="icon" :size="16" />
      </span>
    </div>
    <div class="relative flex items-baseline gap-1.5">
      <span class="text-[30px] leading-[38px] font-semibold tracking-[-0.02em] text-onSurface tabular-nums break-words">{{ value }}</span>
      <span v-if="unit" class="type-title-sm text-onSurfaceVariant">{{ unit }}</span>
    </div>
    <div v-if="trend || hint" class="relative flex items-center gap-1.5 type-body-sm">
      <span
        v-if="trend"
        :class="[
          'type-label-md',
          trendDirection === 'up' ? 'text-success' : trendDirection === 'down' ? 'text-error' : 'text-onSurfaceVariant'
        ]"
      >{{ trend }}</span>
      <span v-if="hint" class="text-onSurfaceVariant">{{ hint }}</span>
    </div>
    <div v-if="$slots.default" class="relative mt-0.5">
      <slot />
    </div>
  </article>
</template>
