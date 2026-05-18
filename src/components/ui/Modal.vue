<script setup>
import { onMounted, onUnmounted, watch } from "vue";
import { X } from "lucide-vue-next";

const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: "" },
  subtitle: { type: String, default: "" },
  size: { type: String, default: "md" },
  closeOnBackdrop: { type: Boolean, default: true },
  showClose: { type: Boolean, default: true },
  scrollable: { type: Boolean, default: true }
});

const emit = defineEmits(["close"]);

function close() {
  emit("close");
}

function handleKey(e) {
  if (e.key === "Escape" && props.open) close();
}

const widthMap = {
  sm: "max-w-md",
  md: "max-w-xl",
  lg: "max-w-3xl",
  xl: "max-w-5xl",
  full: "max-w-[min(96vw,1400px)]"
};

onMounted(() => window.addEventListener("keydown", handleKey));
onUnmounted(() => window.removeEventListener("keydown", handleKey));

watch(
  () => props.open,
  (value) => {
    if (typeof document === "undefined") return;
    document.body.style.overflow = value ? "hidden" : "";
  }
);
</script>

<template>
  <Teleport to="body">
    <Transition name="md-modal">
      <div
        v-if="open"
        class="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-8"
        role="dialog"
        aria-modal="true"
      >
        <div
          class="absolute inset-0 bg-scrim/50 backdrop-blur-sm motion-fade-in"
          @click="closeOnBackdrop && close()"
        />
        <div
          :class="[
            'relative w-full glass-elevated specular-edge rounded-2xl shadow-glass-strong motion-scale-in flex flex-col max-h-[calc(100vh-4rem)]',
            widthMap[size] || widthMap.md
          ]"
        >
          <header
            v-if="$slots.header || title || showClose"
            class="flex items-start justify-between gap-3 px-6 pt-5 pb-4 border-b border-outlineVariant/40"
          >
            <div class="min-w-0 flex-1">
              <slot name="header">
                <h2 v-if="title" class="type-title-lg text-onSurface break-words">{{ title }}</h2>
                <p v-if="subtitle" class="type-body-sm text-onSurfaceVariant mt-0.5">{{ subtitle }}</p>
              </slot>
            </div>
            <button
              v-if="showClose"
              type="button"
              class="state-layer rounded-full h-9 w-9 inline-flex items-center justify-center text-onSurfaceVariant hover:text-onSurface focus-ring shrink-0"
              aria-label="关闭"
              @click="close"
            >
              <X :size="18" />
            </button>
          </header>
          <div :class="['px-6 py-5 flex-1', scrollable ? 'overflow-auto' : '']">
            <slot />
          </div>
          <footer
            v-if="$slots.footer"
            class="px-6 py-4 border-t border-outlineVariant/40 flex flex-wrap items-center justify-end gap-2"
          >
            <slot name="footer" />
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.md-modal-enter-active,
.md-modal-leave-active {
  transition: opacity 0.24s cubic-bezier(0.2, 0, 0, 1);
}
.md-modal-enter-from,
.md-modal-leave-to {
  opacity: 0;
}
</style>
