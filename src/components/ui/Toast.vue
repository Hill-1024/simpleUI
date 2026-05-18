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
      enter-active-class="transition-all duration-300 ease-emphasized-decel"
      enter-from-class="opacity-0 translate-y-3"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition-all duration-200 ease-emphasized-accel"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0 -translate-y-2"
    >
      <div
        v-if="show && message"
        class="fixed top-6 right-6 z-[200] min-w-[280px] max-w-[420px]"
        role="status"
      >
        <div
          :class="[
            'glass-elevated specular-edge rounded-2xl shadow-glass-strong px-4 py-3 flex items-start gap-3',
            variantMap[variant] || variantMap.error
          ]"
        >
          <CircleAlert :size="18" class="shrink-0 mt-0.5" />
          <p class="flex-1 type-body-md break-words">{{ message }}</p>
          <button
            type="button"
            class="state-layer rounded-full h-7 w-7 inline-flex items-center justify-center shrink-0 focus-ring"
            aria-label="关闭"
            @click="$emit('dismiss')"
          >
            <X :size="14" />
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
