<script setup>
import { computed } from "vue";

const props = defineProps({
  variant: { type: String, default: "tonal" },
  color: { type: String, default: "neutral" },
  size: { type: String, default: "md" },
  pill: { type: Boolean, default: true },
  dot: { type: Boolean, default: false }
});

const sizeMap = {
  xs: "min-h-5 px-1.5 py-0.5 type-label-sm gap-1",
  sm: "min-h-6 px-2 py-0.5 type-label-sm gap-1",
  md: "min-h-7 px-2.5 py-1 type-label-md gap-1.5",
  lg: "min-h-8 px-3 py-1 type-label-lg gap-1.5"
};

const tonalMap = {
  neutral: "bg-surfaceContainerHigh text-onSurfaceVariant",
  primary: "bg-primaryContainer text-onPrimaryContainer",
  secondary: "bg-secondaryContainer text-onSecondaryContainer",
  tertiary: "bg-tertiaryContainer text-onTertiaryContainer",
  success: "bg-successContainer text-onSuccessContainer",
  warning: "bg-warningContainer text-onWarningContainer",
  error: "bg-errorContainer text-onErrorContainer"
};

const outlinedMap = {
  neutral: "border border-outlineVariant text-onSurfaceVariant",
  primary: "border border-primary/50 text-primary",
  secondary: "border border-secondary/50 text-secondary",
  tertiary: "border border-tertiary/50 text-tertiary",
  success: "border border-success/50 text-success",
  warning: "border border-warning/50 text-warning",
  error: "border border-error/50 text-error"
};

const filledMap = {
  neutral: "bg-surfaceContainerHighest text-onSurface",
  primary: "bg-primary text-onPrimary",
  secondary: "bg-secondary text-onSecondary",
  tertiary: "bg-tertiary text-onTertiary",
  success: "bg-success text-onSuccess",
  warning: "bg-warning text-onWarning",
  error: "bg-error text-onError"
};

const dotMap = {
  neutral: "bg-onSurfaceVariant",
  primary: "bg-primary",
  secondary: "bg-secondary",
  tertiary: "bg-tertiary",
  success: "bg-success",
  warning: "bg-warning",
  error: "bg-error"
};

const cls = computed(() => {
  const surface =
    props.variant === "outlined"
      ? outlinedMap[props.color] || outlinedMap.neutral
      : props.variant === "filled"
        ? filledMap[props.color] || filledMap.neutral
        : tonalMap[props.color] || tonalMap.neutral;
  return [
    "inline-flex max-w-full items-center font-medium leading-snug transition-colors duration-200 ease-standard",
    sizeMap[props.size] || sizeMap.md,
    surface,
    props.pill ? "rounded-full" : "rounded-sm"
  ];
});
</script>

<template>
  <span :class="cls">
    <span v-if="dot" :class="['inline-block h-1.5 w-1.5 rounded-full shrink-0', dotMap[color] || dotMap.neutral]" />
    <span class="min-w-0 break-words"><slot /></span>
  </span>
</template>
