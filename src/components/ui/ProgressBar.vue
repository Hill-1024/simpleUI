<script setup>
import { computed } from "vue";

const props = defineProps({
  value: { type: [Number, String], default: 0 },
  max: { type: [Number, String], default: 100 },
  label: { type: String, default: "" },
  hint: { type: String, default: "" },
  size: { type: String, default: "md" },
  color: { type: String, default: "auto" },
  showValue: { type: Boolean, default: true }
});

const pct = computed(() => {
  const v = Number(props.value) || 0;
  const m = Number(props.max) || 100;
  if (!m) return 0;
  return Math.max(0, Math.min(100, (v / m) * 100));
});

const heightMap = {
  xs: "h-1",
  sm: "h-1.5",
  md: "h-2",
  lg: "h-2.5"
};

const fillColor = computed(() => {
  if (props.color !== "auto") {
    const map = {
      primary: "bg-primary",
      secondary: "bg-secondary",
      tertiary: "bg-tertiary",
      success: "bg-success",
      warning: "bg-warning",
      error: "bg-error"
    };
    return map[props.color] || "bg-primary";
  }
  if (pct.value >= 88) return "bg-error";
  if (pct.value >= 70) return "bg-warning";
  return "bg-primary";
});
</script>

<template>
  <div class="w-full">
    <div v-if="label || hint || showValue" class="flex items-baseline justify-between gap-2 mb-1.5">
      <span v-if="label" class="type-label-md text-onSurfaceVariant">{{ label }}</span>
      <span v-if="showValue || hint" class="type-label-md text-onSurface tabular-nums">
        {{ hint || `${pct.toFixed(0)}%` }}
      </span>
    </div>
    <div :class="['relative w-full overflow-hidden rounded-full bg-surfaceContainerHighest', heightMap[size] || heightMap.md]">
      <div
        :class="['absolute inset-y-0 left-0 rounded-full transition-all duration-500 ease-emphasized', fillColor]"
        :style="{ width: `${pct}%` }"
      />
    </div>
  </div>
</template>
