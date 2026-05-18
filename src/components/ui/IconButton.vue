<script setup>
import { computed } from "vue";
import { Loader2 } from "lucide-vue-next";

const props = defineProps({
  variant: { type: String, default: "standard" },
  size: { type: String, default: "md" },
  type: { type: String, default: "button" },
  disabled: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  label: { type: String, default: "" }
});

defineEmits(["click"]);

const sizeMap = {
  sm: "h-7 w-7",
  md: "h-9 w-9",
  lg: "h-11 w-11"
};

const iconSize = computed(() => {
  if (props.size === "sm") return 14;
  if (props.size === "lg") return 20;
  return 16;
});

const variantMap = {
  standard: "text-onSurfaceVariant hover:text-onSurface",
  tonal:
    "bg-surfaceContainerHigh text-onSurfaceVariant hover:text-onSurface specular-edge",
  filled:
    "bg-primary text-onPrimary shadow-elev-1 specular-edge",
  outlined:
    "border border-outline text-onSurfaceVariant hover:text-onSurface",
  danger:
    "text-error hover:bg-error/8",
  "danger-tonal":
    "bg-errorContainer text-onErrorContainer specular-edge",
  warning: "text-warning hover:bg-warning/8"
};

const cls = computed(() => [
  "state-layer inline-flex items-center justify-center rounded-full transition-all duration-200 ease-standard focus-ring",
  sizeMap[props.size] || sizeMap.md,
  variantMap[props.variant] || variantMap.standard,
  (props.disabled || props.loading) ? "pointer-events-none opacity-40" : ""
]);
</script>

<template>
  <button
    :class="cls"
    :type="type"
    :aria-label="label || undefined"
    :aria-disabled="disabled || loading"
    :disabled="disabled || loading"
    @click="$emit('click', $event)"
  >
    <Loader2 v-if="loading" class="spin" :size="iconSize" />
    <slot v-else :size="iconSize" />
  </button>
</template>
