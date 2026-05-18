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

const accentMap = {
  primary: "from-primary/15 to-primary/0 text-primary",
  secondary: "from-secondary/15 to-secondary/0 text-secondary",
  tertiary: "from-tertiary/15 to-tertiary/0 text-tertiary",
  success: "from-success/15 to-success/0 text-success",
  warning: "from-warning/15 to-warning/0 text-warning",
  error: "from-error/15 to-error/0 text-error"
};

const accentClass = computed(() => accentMap[props.accent] || accentMap.primary);
</script>

<template>
  <article
    class="glass-panel specular-edge rounded-2xl p-5 flex flex-col gap-3 relative overflow-hidden transition-all duration-300 ease-standard hover:-translate-y-0.5 hover:shadow-glass-strong"
  >
    <div :class="['absolute inset-0 bg-gradient-to-br opacity-60 pointer-events-none', accentClass]" />
    <div class="relative flex items-start justify-between gap-3">
      <p class="type-label-lg text-onSurfaceVariant">{{ label }}</p>
      <span
        v-if="icon"
        :class="['grid place-items-center h-9 w-9 rounded-full bg-surfaceContainerHighest specular-edge', accentClass.split(' ').pop()]"
      >
        <component :is="icon" :size="16" />
      </span>
    </div>
    <div class="relative flex items-baseline gap-1.5">
      <span class="type-headline-md text-onSurface tabular-nums break-words">{{ value }}</span>
      <span v-if="unit" class="type-title-md text-onSurfaceVariant">{{ unit }}</span>
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
    <div v-if="$slots.default" class="relative mt-1">
      <slot />
    </div>
  </article>
</template>
