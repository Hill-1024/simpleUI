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
  sm: "min-h-8 px-3 py-1.5 type-label-md gap-1.5",
  md: "min-h-10 px-5 py-2 type-label-lg gap-2",
  lg: "min-h-12 px-6 py-2.5 type-title-md gap-2.5"
};

const variantMap = {
  filled:
    "bg-primary text-onPrimary shadow-elev-1 hover:shadow-elev-2 specular-edge",
  tonal:
    "bg-primaryContainer text-onPrimaryContainer hover:shadow-elev-1 specular-edge",
  outlined:
    "bg-transparent text-primary border border-outline hover:bg-primary/8",
  text: "bg-transparent text-primary hover:bg-primary/8",
  danger:
    "bg-error text-onError shadow-elev-1 hover:shadow-elev-2 specular-edge",
  "danger-tonal":
    "bg-errorContainer text-onErrorContainer hover:shadow-elev-1 specular-edge",
  warning:
    "bg-warning text-onWarning shadow-elev-1 hover:shadow-elev-2 specular-edge",
  glass:
    "glass-elevated text-onSurface specular-edge"
};

const cls = computed(() => [
  "state-layer inline-flex items-center justify-center font-medium select-none min-w-0 transition-all duration-200 ease-standard focus-ring",
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
