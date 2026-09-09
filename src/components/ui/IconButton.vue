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
  sm: "h-8 w-8",
  md: "h-9.5 w-9.5",
  lg: "h-11 w-11"
};

const iconSize = computed(() => {
  if (props.size === "sm") return 14;
  if (props.size === "lg") return 19;
  return 16;
});

const variantMap = {
  standard:
    "text-onSurfaceVariant hover:text-onSurface hover:bg-[rgb(var(--md-surface-container-high))]",
  tonal:
    "bg-[rgb(var(--md-surface-container-high))] text-onSurfaceVariant hover:text-onSurface specular-ring",
  filled:
    "bg-primary text-onPrimary shadow-elev-1 specular-ring",
  outlined:
    "border border-[rgb(var(--md-outline-variant)/0.8)] text-onSurfaceVariant hover:text-onSurface",
  danger:
    "text-error hover:bg-error/10",
  "danger-tonal":
    "bg-errorContainer text-onErrorContainer specular-ring",
  warning:
    "text-warning hover:bg-warning/10"
};

const cls = computed(() => [
  "state-layer press inline-flex items-center justify-center rounded-full transition-all duration-250 ease-out-soft focus-ring",
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
    :title="label || undefined"
    :aria-disabled="disabled || loading"
    :disabled="disabled || loading"
    @click="$emit('click', $event)"
  >
    <Loader2 v-if="loading" class="spin" :size="iconSize" />
    <slot v-else :size="iconSize" />
  </button>
</template>
