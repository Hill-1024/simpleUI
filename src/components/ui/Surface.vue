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
      return "glass-elevated specular-edge";
    case "soft":
      return "glass-soft specular-edge";
    case "rail":
      return "glass-rail specular-edge";
    case "flat":
      return "bg-surfaceContainerLow border border-outlineVariant/40";
    case "ghost":
      return "bg-transparent";
    default:
      return "glass-panel specular-edge";
  }
});
</script>

<template>
  <component
    :is="tag"
    :class="[
      'relative isolate transition-all duration-300 ease-standard',
      variantClass,
      radiusMap[radius] || radiusMap.lg,
      padMap[padding] || padMap.md,
      interactive ? 'hover:-translate-y-px hover:shadow-glass-strong cursor-pointer' : ''
    ]"
  >
    <slot />
  </component>
</template>
