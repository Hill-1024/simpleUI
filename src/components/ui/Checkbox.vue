<script setup>
import { computed } from "vue";
import { Check, Minus } from "lucide-vue-next";

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  indeterminate: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  size: { type: String, default: "md" }
});

const emit = defineEmits(["update:modelValue", "change"]);

const sizeMap = {
  sm: "h-4 w-4",
  md: "h-[18px] w-[18px]",
  lg: "h-5 w-5"
};

const iconSize = computed(() => (props.size === "sm" ? 12 : props.size === "lg" ? 16 : 14));

const isChecked = computed(() => props.modelValue || props.indeterminate);

function toggle() {
  if (props.disabled) return;
  emit("update:modelValue", !props.modelValue);
  emit("change", !props.modelValue);
}
</script>

<template>
  <button
    type="button"
    :class="[
      'inline-flex items-center justify-center rounded-sm border-2 transition-all duration-150 ease-standard shrink-0 focus-ring',
      sizeMap[size] || sizeMap.md,
      isChecked
        ? 'bg-primary border-primary text-onPrimary'
        : 'bg-transparent border-outline hover:border-primary',
      disabled ? 'opacity-40 pointer-events-none' : ''
    ]"
    :aria-checked="indeterminate ? 'mixed' : modelValue"
    role="checkbox"
    :aria-disabled="disabled"
    @click.stop="toggle"
  >
    <Minus v-if="indeterminate" :size="iconSize" />
    <Check v-else-if="modelValue" :size="iconSize" />
  </button>
</template>
