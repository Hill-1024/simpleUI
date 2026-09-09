<script setup>
import { computed, ref } from "vue";

const props = defineProps({
  modelValue: { type: String, default: "" },
  label: { type: String, default: "" },
  placeholder: { type: String, default: "" },
  helper: { type: String, default: "" },
  error: { type: String, default: "" },
  disabled: { type: Boolean, default: false },
  required: { type: Boolean, default: false },
  rows: { type: Number, default: 4 },
  monospace: { type: Boolean, default: false }
});

defineEmits(["update:modelValue", "focus", "blur"]);
const focused = ref(false);

const isFloating = computed(() => focused.value || String(props.modelValue ?? "").length > 0);

const ringClass = computed(() => {
  if (props.error) return "border-error/70 focus-within:border-error focus-within:ring-2 focus-within:ring-error/15";
  return "border-[rgb(var(--md-outline-variant)/0.9)] focus-within:border-primary/70 focus-within:ring-2 focus-within:ring-primary/15";
});
</script>

<template>
  <label class="block">
    <div
      :class="[
        'relative w-full rounded-xl border bg-[rgb(var(--md-surface-container-high)/0.45)] dark:bg-[rgb(var(--md-surface-container-high)/0.4)] transition-all duration-250 ease-out-soft',
        ringClass,
        disabled ? 'opacity-50 pointer-events-none' : '',
        focused && !error ? 'bg-[rgb(var(--md-surface-container-lowest))]' : ''
      ]"
    >
      <span
        v-if="label"
        :class="[
          'absolute left-3.5 transition-all duration-250 ease-out-soft pointer-events-none origin-left',
          isFloating
            ? 'top-1.5 type-label-sm'
            : 'top-3 type-body-md',
          error ? 'text-error' : focused ? 'text-primary' : 'text-onSurfaceVariant'
        ]"
      >
        {{ label }}<span v-if="required" class="text-error pl-0.5">*</span>
      </span>
      <textarea
        :value="modelValue"
        :placeholder="isFloating || !label ? placeholder : ''"
        :rows="rows"
        :disabled="disabled"
        :required="required"
        :class="[
          'block w-full bg-transparent outline-none border-none text-onSurface placeholder-onSurfaceVariant/55 resize-y',
          monospace ? 'font-mono type-body-sm' : 'type-body-md',
          'px-3.5',
          label ? 'pt-6 pb-2.5' : 'py-3'
        ]"
        @input="$emit('update:modelValue', $event.target.value)"
        @focus="focused = true; $emit('focus', $event)"
        @blur="focused = false; $emit('blur', $event)"
      />
    </div>
    <p v-if="error" class="mt-1.5 px-1 type-body-sm text-error">{{ error }}</p>
    <p v-else-if="helper" class="mt-1.5 px-1 type-body-sm text-onSurfaceVariant">{{ helper }}</p>
  </label>
</template>
