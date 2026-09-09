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
  sm: "h-4 w-4 rounded-[5px]",
  md: "h-[18px] w-[18px] rounded-md",
  lg: "h-5 w-5 rounded-[7px]"
};

const iconSize = computed(() => (props.size === "sm" ? 11 : props.size === "lg" ? 14 : 12));

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
      'inline-flex items-center justify-center border transition-all duration-250 ease-out-soft shrink-0 focus-ring',
      sizeMap[size] || sizeMap.md,
      isChecked
        ? 'bg-primary border-primary text-onPrimary specular-ring'
        : 'bg-[rgb(var(--md-surface-container-lowest)/0.6)] border-[rgb(var(--md-outline)/0.7)] hover:border-primary',
      disabled ? 'opacity-40 pointer-events-none' : ''
    ]"
    :aria-checked="indeterminate ? 'mixed' : modelValue"
    role="checkbox"
    :aria-disabled="disabled"
    @click.stop="toggle"
  >
    <Transition
      enter-active-class="transition-all duration-200 ease-spring"
      enter-from-class="scale-50 opacity-0"
      leave-to-class="scale-50 opacity-0"
      leave-active-class="transition-all duration-150"
      mode="out-in"
    >
      <Minus v-if="indeterminate" :size="iconSize" key="minus" />
      <Check v-else-if="modelValue" :size="iconSize" key="check" />
    </Transition>
  </button>
</template>
