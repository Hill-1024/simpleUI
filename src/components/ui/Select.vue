<script setup>
import { computed, ref } from "vue";
import { ChevronDown } from "lucide-vue-next";

const props = defineProps({
  modelValue: { type: [String, Number, null], default: "" },
  label: { type: String, default: "" },
  helper: { type: String, default: "" },
  error: { type: String, default: "" },
  disabled: { type: Boolean, default: false },
  required: { type: Boolean, default: false },
  density: { type: String, default: "comfortable" }
});

const emit = defineEmits(["update:modelValue", "change"]);
const focused = ref(false);
const value = computed({
  get: () => props.modelValue,
  set: (v) => emit("update:modelValue", v)
});

const hasValue = computed(() => value.value !== "" && value.value !== null && value.value !== undefined);
const isFloating = computed(() => Boolean(props.label) || focused.value || hasValue.value);
const isActive = computed(() => focused.value || hasValue.value);

const ringClass = computed(() => {
  if (props.error) return "border-error/70 focus-within:border-error focus-within:ring-2 focus-within:ring-error/15";
  return "border-[rgb(var(--md-outline-variant)/0.9)] focus-within:border-primary/70 focus-within:ring-2 focus-within:ring-primary/15";
});

const heightClass = computed(() => {
  if (props.density === "compact") return props.label ? "min-h-11" : "min-h-10";
  return props.label ? "min-h-13.5" : "min-h-11.5";
});
</script>

<template>
  <label class="block">
    <div
      :class="[
        'relative w-full rounded-xl border bg-[rgb(var(--md-surface-container-high)/0.45)] dark:bg-[rgb(var(--md-surface-container-high)/0.4)] transition-all duration-250 ease-out-soft flex items-center',
        heightClass,
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
            : 'top-1/2 -translate-y-1/2 type-body-md',
          error ? 'text-error' : focused ? 'text-primary' : 'text-onSurfaceVariant'
        ]"
      >
        {{ label }}<span v-if="required" class="text-error pl-0.5">*</span>
      </span>
      <select
        v-model="value"
        :disabled="disabled"
        :required="required"
        :class="[
          'flex-1 w-full appearance-none bg-transparent outline-none border-none text-onSurface type-body-md cursor-pointer',
          'pl-3.5 pr-10',
          label ? 'pt-6 pb-1.5' : 'py-2'
        ]"
        @focus="focused = true"
        @blur="focused = false"
        @change="$emit('change', $event)"
      >
        <slot />
      </select>
      <span
        class="absolute right-3.5 top-1/2 -translate-y-1/2 grid place-items-center h-5.5 w-5.5 rounded-full pointer-events-none transition-colors duration-250 ease-out-soft"
        :class="focused ? 'text-primary' : 'text-onSurfaceVariant/70'"
      >
        <ChevronDown
          :size="14"
          class="transition-transform duration-300 ease-signature"
          :class="focused ? 'rotate-180' : ''"
        />
      </span>
    </div>
    <p v-if="error" class="mt-1.5 px-1 type-body-sm text-error">{{ error }}</p>
    <p v-else-if="helper" class="mt-1.5 px-1 type-body-sm text-onSurfaceVariant">{{ helper }}</p>
  </label>
</template>
