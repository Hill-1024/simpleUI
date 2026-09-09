<script setup>
import { computed } from "vue";

const props = defineProps({
  variant: { type: String, default: "panel" },
  tag: { type: String, default: "section" },
  radius: { type: String, default: "lg" },
  padding: { type: String, default: "md" },
  interactive: { type: Boolean, default: false }
});

const radiusMap = {
  none: "rounded-none",
  sm: "rounded-sm",
  md: "rounded-md",
  lg: "rounded-lg",
  xl: "rounded-xl",
  "2xl": "rounded-2xl"
};

const padMap = {
  none: "p-0",
  xs: "p-3",
  sm: "p-4",
  md: "p-5",
  lg: "p-6",
  xl: "p-8"
};

const variantClass = computed(() => {
  switch (props.variant) {
    case "elevated":
      return "glass-elevated";
    case "soft":
      return "glass-soft";
    case "rail":
      return "glass-rail";
    case "flat":
      return "bg-[rgb(var(--md-surface-container-high)/0.4)] border border-[rgb(var(--md-outline-variant)/0.5)] dark:border-white/6";
    case "ghost":
      return "bg-transparent";
    default:
      return "glass-panel";
  }
});
</script>

<template>
  <component
    :is="tag"
    :class="[
      'relative isolate transition-all duration-350 ease-out-soft',
      variantClass,
      radiusMap[radius] || radiusMap.lg,
      padMap[padding] || padMap.md,
      interactive ? 'press hover:shadow-elev-3 cursor-pointer' : ''
    ]"
  >
    <slot />
  </component>
</template>
