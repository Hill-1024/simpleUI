<script setup>
import { computed } from "vue";
import { Loader2 } from "lucide-vue-next";

const props = defineProps({
  variant: { type: String, default: "filled" },
  size: { type: String, default: "md" },
  type: { type: String, default: "button" },
  disabled: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  block: { type: Boolean, default: false },
  pill: { type: Boolean, default: true }
});

defineEmits(["click"]);

const sizeMap = {
  sm: "min-h-8 px-3.5 py-1.5 type-label-md gap-1.5",
  md: "min-h-10 px-5 py-2 type-label-lg gap-2",
  lg: "min-h-12 px-6 py-2.5 type-title-md gap-2.5"
};

const variantMap = {
  filled:
    "bg-primary text-onPrimary shadow-elev-1 hover:shadow-elev-2 specular-ring",
  tonal:
    "bg-primaryContainer text-onPrimaryContainer hover:shadow-elev-1 specular-ring",
  soft:
    "bg-[rgb(var(--md-surface-container-high))] text-onSurface border border-[rgb(var(--md-outline-variant)/0.6)] dark:border-white/8 hover:bg-[rgb(var(--md-surface-container-highest))] shadow-elev-1",
  outlined:
    "bg-transparent text-primary border border-primary/45 hover:bg-primary/8",
  text: "bg-transparent text-primary hover:bg-primary/8",
  danger:
    "bg-error text-onError shadow-elev-1 hover:shadow-elev-2 specular-ring",
  "danger-tonal":
    "bg-errorContainer text-onErrorContainer hover:shadow-elev-1 specular-ring",
  warning:
    "bg-warning text-onWarning shadow-elev-1 hover:shadow-elev-2 specular-ring",
  "warning-tonal":
    "bg-warningContainer text-onWarningContainer hover:shadow-elev-1 specular-ring",
  glass:
    "glass-elevated text-onSurface specular-ring"
};

const cls = computed(() => [
  "state-layer press inline-flex items-center justify-center font-semibold select-none min-w-0 transition-all duration-250 ease-out-soft focus-ring",
  sizeMap[props.size] || sizeMap.md,
  variantMap[props.variant] || variantMap.filled,
  props.pill ? "rounded-full" : "rounded-md",
  props.block ? "w-full" : "",
  (props.disabled || props.loading) ? "pointer-events-none" : ""
]);
</script>

<template>
  <button
    :class="cls"
    :type="type"
    :aria-disabled="disabled || loading"
    :disabled="disabled || loading"
    @click="$emit('click', $event)"
  >
    <Loader2 v-if="loading" class="spin shrink-0" :size="size === 'sm' ? 14 : 16" />
    <slot name="leading" v-else />
    <span v-if="$slots.default" class="inline-flex min-w-0 items-center justify-center text-center leading-snug"><slot /></span>
    <slot name="trailing" />
  </button>
</template>
