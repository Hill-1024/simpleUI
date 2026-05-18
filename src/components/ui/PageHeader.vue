<script setup>
defineProps({
  title: { type: String, default: "" },
  description: { type: String, default: "" },
  eyebrow: { type: String, default: "" }
});
</script>

<template>
  <header class="flex items-end justify-between gap-6 flex-wrap mb-6">
    <div class="min-w-0 flex-1">
      <p v-if="eyebrow" class="type-label-md text-primary uppercase mb-2 break-words">{{ eyebrow }}</p>
      <h1 v-if="title" class="type-headline-md text-onSurface">{{ title }}</h1>
      <p v-if="description" class="type-body-md text-onSurfaceVariant mt-1.5 max-w-2xl">{{ description }}</p>
    </div>
    <div v-if="$slots.actions" class="flex items-center gap-2 shrink-0">
      <slot name="actions" />
    </div>
  </header>
</template>
