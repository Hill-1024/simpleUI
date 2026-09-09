<script setup>
import { computed, ref, useAttrs } from "vue";

const props = defineProps({
  modelValue: { type: [String, Number], default: "" },
  label: { type: String, default: "" },
  type: { type: String, default: "text" },
  placeholder: { type: String, default: "" },
  helper: { type: String, default: "" },
  error: { type: String, default: "" },
  disabled: { type: Boolean, default: false },
  required: { type: Boolean, default: false },
  readonly: { type: Boolean, default: false },
  autofocus: { type: Boolean, default: false },
  autocomplete: { type: String, default: "off" },
  size: { type: String, default: "md" },
  density: { type: String, default: "comfortable" },
  inputmode: { type: String, default: undefined },
  min: { type: [String, Number], default: undefined },
  max: { type: [String, Number], default: undefined },
  step: { type: [String, Number], default: undefined }
});

const emit = defineEmits(["update:modelValue", "focus", "blur", "keydown", "input"]);
const attrs = useAttrs();
const focused = ref(false);
const inputRef = ref(null);

const isFloating = computed(() => focused.value || String(props.modelValue ?? "").length > 0);

const ringClass = computed(() => {
  if (props.error) return "border-error/70 focus-within:border-error focus-within:ring-2 focus-within:ring-error/15";
  return "border-[rgb(var(--md-outline-variant)/0.9)] focus-within:border-primary/70 focus-within:ring-2 focus-within:ring-primary/15";
});

const heightClass = computed(() => {
  if (props.density === "compact") return props.label ? "min-h-11" : "min-h-10";
  if (props.size === "lg") return "min-h-14";
  return props.label ? "min-h-13.5" : "min-h-11.5";
});

function onInput(e) {
  emit("update:modelValue", e.target.value);
  emit("input", e);
}

defineExpose({
  focus: () => inputRef.value?.focus(),
  blur: () => inputRef.value?.blur(),
  el: () => inputRef.value
});
</script>

<template>
  <label class="block">
    <div
      :class="[
        'group relative w-full rounded-xl border bg-[rgb(var(--md-surface-container-high)/0.45)] dark:bg-[rgb(var(--md-surface-container-high)/0.4)] transition-all duration-250 ease-out-soft flex items-center',
        heightClass,
        ringClass,
        disabled ? 'opacity-50 pointer-events-none' : '',
        focused && !error ? 'bg-[rgb(var(--md-surface-container-lowest))]' : ''
      ]"
    >
      <div v-if="$slots.leading" class="pl-3.5 pr-1 text-onSurfaceVariant flex items-center">
        <slot name="leading" />
      </div>
      <span
        v-if="label"
        :class="[
          'absolute transition-all duration-250 ease-out-soft pointer-events-none origin-left',
          isFloating
            ? 'top-1.5 type-label-sm'
            : 'top-1/2 -translate-y-1/2 type-body-md',
          props.error ? 'text-error' : focused ? 'text-primary' : 'text-onSurfaceVariant',
          $slots.leading ? 'left-11' : 'left-3.5'
        ]"
      >
        {{ label }}<span v-if="required" class="text-error pl-0.5">*</span>
      </span>
      <input
        ref="inputRef"
        :type="type"
        :value="modelValue"
        :placeholder="isFloating || !label ? placeholder : ''"
        :disabled="disabled"
        :readonly="readonly"
        :required="required"
        :autofocus="autofocus"
        :autocomplete="autocomplete"
        :inputmode="inputmode"
        :min="min"
        :max="max"
        :step="step"
        v-bind="attrs"
        :class="[
          'flex-1 w-full bg-transparent outline-none border-none text-onSurface placeholder-onSurfaceVariant/55 type-body-md',
          $slots.leading ? 'pl-1 pr-3.5' : 'px-3.5',
          label ? 'pt-6 pb-1.5' : 'py-2'
        ]"
        @input="onInput"
        @focus="focused = true; $emit('focus', $event)"
        @blur="focused = false; $emit('blur', $event)"
        @keydown="$emit('keydown', $event)"
      />
      <div v-if="$slots.trailing" class="pr-3 pl-1 text-onSurfaceVariant flex items-center">
        <slot name="trailing" />
      </div>
    </div>
    <p v-if="error" class="mt-1.5 px-1 type-body-sm text-error">{{ error }}</p>
    <p v-else-if="helper" class="mt-1.5 px-1 type-body-sm text-onSurfaceVariant">{{ helper }}</p>
  </label>
</template>
