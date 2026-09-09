<script setup>
defineProps({
  icon: { type: [Object, Function], default: null },
  title: { type: String, default: "" },
  description: { type: String, default: "" },
  compact: { type: Boolean, default: false }
});
</script>

<template>
  <div
    :class="[
      'flex flex-col items-center justify-center text-center gap-3 mx-auto',
      compact ? 'py-7' : 'py-14',
      'max-w-md'
    ]"
  >
    <div
      v-if="icon"
      class="relative"
    >
      <div class="absolute inset-0 rounded-full bg-primary/15 blur-lg" aria-hidden="true" />
      <div class="relative grid place-items-center h-14 w-14 rounded-2xl bg-[rgb(var(--md-surface-container-high)/0.7)] border border-[rgb(var(--md-outline-variant)/0.6)] dark:border-white/8 text-onSurfaceVariant">
        <component :is="icon" :size="22" />
      </div>
    </div>
    <h3 v-if="title" class="type-title-md text-onSurface">{{ title }}</h3>
    <p v-if="description" class="type-body-md text-onSurfaceVariant">{{ description }}</p>
    <div v-if="$slots.action" class="mt-2">
      <slot name="action" />
    </div>
  </div>
</template>
