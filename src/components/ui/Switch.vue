<script setup>
import { computed } from "vue";

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  label: { type: String, default: "" }
});

const emit = defineEmits(["update:modelValue"]);

const on = computed(() => props.modelValue);

function toggle() {
  if (props.disabled) return;
  emit("update:modelValue", !on.value);
}
</script>

<template>
  <button
    type="button"
    :class="[
      'inline-flex items-center gap-2.5 select-none focus-ring rounded-full transition',
      disabled ? 'opacity-50 pointer-events-none' : ''
    ]"
    role="switch"
    :aria-checked="on"
    :aria-disabled="disabled"
    @click="toggle"
  >
    <span
      :class="[
        'relative inline-flex h-6 w-10.5 shrink-0 items-center rounded-full transition-colors duration-300 ease-signature border',
        on
          ? 'bg-primary border-primary specular-ring'
          : 'bg-[rgb(var(--md-surface-container-highest))] border-[rgb(var(--md-outline-variant))]'
      ]"
    >
      <span
        :class="[
          'inline-block rounded-full shadow-elev-1 transition-all duration-300 ease-signature',
          on ? 'h-4.5 w-4.5 translate-x-[22px] bg-onPrimary' : 'h-3.5 w-3.5 translate-x-[5px] bg-[rgb(var(--md-outline))]'
        ]"
      />
    </span>
    <span v-if="label" class="type-label-lg text-onSurface">{{ label }}</span>
    <slot />
  </button>
</template>
