<script setup>
import { computed } from "vue";

const props = defineProps({
  color: { type: String, default: "primary" },
  dot: { type: Boolean, default: false }
});

const colorMap = {
  primary: "bg-primary text-onPrimary",
  secondary: "bg-secondary text-onSecondary",
  tertiary: "bg-tertiary text-onTertiary",
  success: "bg-success text-onSuccess",
  warning: "bg-warning text-onWarning",
  error: "bg-error text-onError",
  neutral: "bg-onSurfaceVariant text-surface"
};

const cls = computed(() => [
  "inline-flex items-center justify-center rounded-full font-semibold",
  props.dot ? "h-2 w-2 min-w-0 p-0" : "min-h-5 min-w-5 px-1.5 py-0.5 type-label-sm",
  colorMap[props.color] || colorMap.primary
]);
</script>

<template>
  <span :class="cls"><slot v-if="!dot" /></span>
</template>
