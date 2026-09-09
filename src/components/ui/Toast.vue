<script setup>
import { CircleAlert, X } from "lucide-vue-next";

defineProps({
  message: { type: String, default: "" },
  variant: { type: String, default: "error" },
  show: { type: Boolean, default: false }
});

defineEmits(["dismiss"]);

const variantMap = {
  error: "bg-errorContainer text-onErrorContainer",
  warning: "bg-warningContainer text-onWarningContainer",
  success: "bg-successContainer text-onSuccessContainer",
  info: "bg-secondaryContainer text-onSecondaryContainer"
};
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-all duration-400 ease-spring"
      enter-from-class="opacity-0 translate-y-4 scale-[0.97]"
      enter-to-class="opacity-100 translate-y-0 scale-100"
      leave-active-class="transition-all duration-250 ease-emphasized-accel"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0 -translate-y-2"
    >
      <div
        v-if="show && message"
        class="fixed top-5 right-5 z-[200] min-w-[280px] max-w-[420px]"
        role="status"
      >
        <div
          :class="[
            'glass-elevated rounded-2xl px-4 py-3 flex items-start gap-3',
            variantMap[variant] || variantMap.error
          ]"
        >
          <CircleAlert :size="17" class="shrink-0 mt-0.5" />
          <p class="flex-1 type-body-md break-words">{{ message }}</p>
          <button
            type="button"
            class="state-layer press rounded-full h-7 w-7 inline-flex items-center justify-center shrink-0 focus-ring"
            aria-label="关闭"
            @click="$emit('dismiss')"
          >
            <X :size="13" />
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
