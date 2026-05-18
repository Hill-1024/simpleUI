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
  if (props.error) return "border-error focus-within:border-error";
  return "border-outline focus-within:border-primary";
});

const heightClass = computed(() => {
  if (props.density === "compact") return props.label ? "min-h-11" : "min-h-10";
  return props.label ? "min-h-14" : "min-h-12";
});
</script>

<template>
  <label class="block">
    <div
      :class="[
        'relative w-full rounded-md border bg-surfaceContainerLow/60 backdrop-blur-md transition-all duration-200 ease-standard flex items-center',
        heightClass,
        ringClass,
        disabled ? 'opacity-50 pointer-events-none' : ''
      ]"
    >
      <span
        v-if="label"
        :class="[
          'absolute left-3.5 transition-all duration-200 ease-standard pointer-events-none origin-left',
          isFloating
            ? 'top-1.5 type-label-sm'
            : 'top-1/2 -translate-y-1/2 type-body-md',
          error ? 'text-error' : isActive ? 'text-primary' : 'text-onSurfaceVariant'
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
          label ? 'pt-7 pb-2' : 'py-2'
        ]"
        @focus="focused = true"
        @blur="focused = false"
        @change="$emit('change', $event)"
      >
        <slot />
      </select>
      <ChevronDown class="absolute right-3 top-1/2 -translate-y-1/2 text-onSurfaceVariant pointer-events-none" :size="16" />
    </div>
    <p v-if="error" class="mt-1 px-3.5 type-body-sm text-error">{{ error }}</p>
    <p v-else-if="helper" class="mt-1 px-3.5 type-body-sm text-onSurfaceVariant">{{ helper }}</p>
  </label>
</template>
