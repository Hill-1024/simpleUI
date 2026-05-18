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
      'inline-flex items-center gap-3 select-none focus-ring rounded-full transition',
      disabled ? 'opacity-50 pointer-events-none' : ''
    ]"
    :aria-pressed="on"
    :aria-disabled="disabled"
    @click="toggle"
  >
    <span
      :class="[
        'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-300 ease-standard border',
        on
          ? 'bg-primary border-primary'
          : 'bg-surfaceContainerHigh border-outline'
      ]"
    >
      <span
        :class="[
          'inline-block rounded-full bg-onPrimary shadow-elev-2 transition-all duration-300 ease-emphasized',
          on ? 'h-5 w-5 translate-x-6' : 'h-4 w-4 translate-x-1 bg-outline'
        ]"
      />
    </span>
    <span v-if="label" class="type-body-md text-onSurface">{{ label }}</span>
    <slot />
  </button>
</template>
