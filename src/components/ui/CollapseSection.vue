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
  <section class="glass-panel rounded-2xl">
    <header
      class="state-layer flex items-center justify-between gap-3 px-5 py-4 cursor-pointer select-none"
      @click="toggle"
    >
      <div class="min-w-0 flex-1">
        <h3 v-if="title" class="type-title-md text-onSurface">{{ title }}</h3>
        <p v-if="description" class="type-body-sm text-onSurfaceVariant mt-0.5">{{ description }}</p>
        <slot name="header" />
      </div>
      <div class="flex items-center gap-2">
        <slot name="actions" />
        <span class="grid place-items-center h-8 w-8 rounded-full bg-[rgb(var(--md-surface-container-high)/0.6)] text-onSurfaceVariant">
          <ChevronDown
            :size="16"
            :class="['transition-transform duration-350 ease-signature', internal ? 'rotate-180' : '']"
          />
        </span>
      </div>
    </header>
    <transition
      enter-active-class="transition-all duration-400 ease-out-soft"
      enter-from-class="max-h-0 opacity-0"
      enter-to-class="max-h-[2000px] opacity-100"
      leave-active-class="transition-all duration-250 ease-emphasized-accel"
      leave-from-class="max-h-[2000px] opacity-100"
      leave-to-class="max-h-0 opacity-0"
    >
      <div
        v-show="internal"
        :class="['overflow-hidden border-t border-[rgb(var(--md-outline-variant)/0.45)] dark:border-white/5', noPad ? '' : 'px-5 py-5']"
      >
        <slot />
      </div>
    </transition>
  </section>
</template>
