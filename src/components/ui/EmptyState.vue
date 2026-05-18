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
      compact ? 'py-6' : 'py-12',
      'max-w-md'
    ]"
  >
    <div
      v-if="icon"
      class="grid place-items-center h-14 w-14 rounded-full bg-secondaryContainer text-onSecondaryContainer specular-edge"
    >
      <component :is="icon" :size="24" />
    </div>
    <h3 v-if="title" class="type-title-md text-onSurface">{{ title }}</h3>
    <p v-if="description" class="type-body-md text-onSurfaceVariant">{{ description }}</p>
    <div v-if="$slots.action" class="mt-2">
      <slot name="action" />
    </div>
  </div>
</template>
