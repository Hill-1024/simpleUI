<script setup>
const props = defineProps({
  modelValue: { type: [String, Number], required: true },
  options: { type: Array, required: true },
  size: { type: String, default: "md" },
  fullWidth: { type: Boolean, default: false }
});

const emit = defineEmits(["update:modelValue"]);

function activate(option) {
  if (option.disabled) return;
  emit("update:modelValue", option.value);
}
</script>

<template>
  <div
    :class="[
      'inline-flex rounded-full p-1 gap-0.5 bg-[rgb(var(--md-surface-container-high)/0.55)] border border-[rgb(var(--md-outline-variant)/0.5)] dark:border-white/6',
      fullWidth ? 'w-full' : ''
    ]"
    role="tablist"
  >
    <button
      v-for="opt in options"
      :key="opt.value"
      type="button"
      role="tab"
      :aria-selected="modelValue === opt.value"
      :class="[
        'state-layer press relative inline-flex items-center justify-center gap-1.5 rounded-full transition-all duration-250 ease-out-soft focus-ring',
        size === 'sm' ? 'min-h-7.5 px-3 py-1 type-label-md' : 'min-h-9 px-4 py-1.5 type-label-lg',
        fullWidth ? 'flex-1' : '',
        modelValue === opt.value
          ? 'bg-[rgb(var(--md-surface-container-lowest))] text-onSurface shadow-elev-1 dark:bg-[rgb(var(--md-surface-container-highest))]'
          : 'text-onSurfaceVariant hover:text-onSurface'
      ]"
      :disabled="opt.disabled"
      @click="activate(opt)"
    >
      <component v-if="opt.icon" :is="opt.icon" :size="14" />
      {{ opt.label }}
    </button>
  </div>
</template>
