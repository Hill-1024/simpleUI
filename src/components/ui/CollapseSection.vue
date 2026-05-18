<script setup>
import { ref, watch } from "vue";
import { ChevronDown } from "lucide-vue-next";

const props = defineProps({
  title: { type: String, default: "" },
  description: { type: String, default: "" },
  modelValue: { type: Boolean, default: true },
  defaultOpen: { type: Boolean, default: true },
  noPad: { type: Boolean, default: false }
});

const emit = defineEmits(["update:modelValue"]);
const internal = ref(props.modelValue ?? props.defaultOpen);

watch(
  () => props.modelValue,
  (v) => {
    if (typeof v === "boolean") internal.value = v;
  }
);

function toggle() {
  internal.value = !internal.value;
  emit("update:modelValue", internal.value);
}
</script>

<template>
  <section class="glass-panel specular-edge rounded-2xl">
    <header
      :class="[
        'state-layer flex items-center justify-between gap-3 px-5 py-4 cursor-pointer rounded-2xl select-none',
        internal ? 'rounded-b-none' : ''
      ]"
      @click="toggle"
    >
      <div class="min-w-0 flex-1">
        <h3 v-if="title" class="type-title-md text-onSurface">{{ title }}</h3>
        <p v-if="description" class="type-body-sm text-onSurfaceVariant mt-0.5">{{ description }}</p>
        <slot name="header" />
      </div>
      <div class="flex items-center gap-2">
        <slot name="actions" />
        <ChevronDown
          :size="18"
          :class="['text-onSurfaceVariant transition-transform duration-300 ease-emphasized', internal ? 'rotate-180' : '']"
        />
      </div>
    </header>
    <transition
      enter-active-class="transition-all duration-300 ease-emphasized-decel"
      enter-from-class="max-h-0 opacity-0"
      enter-to-class="max-h-[2000px] opacity-100"
      leave-active-class="transition-all duration-200 ease-emphasized-accel"
      leave-from-class="max-h-[2000px] opacity-100"
      leave-to-class="max-h-0 opacity-0"
    >
      <div
        v-show="internal"
        :class="['overflow-hidden border-t border-outlineVariant/40', noPad ? '' : 'px-5 py-5']"
      >
        <slot />
      </div>
    </transition>
  </section>
</template>
