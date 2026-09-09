<script setup>
import { computed } from "vue";
import { Terminal, ScrollText } from "lucide-vue-next";
import { Surface, Chip } from "../components/ui";
import { useAppBindings } from "../composables/useAppBindings.js";

const { activeJob, jobLogs, statusLabel } = useAppBindings();

const statusColorMap = {
  succeeded: "success",
  running: "primary",
  queued: "neutral",
  failed: "error",
  cancelled: "warning"
};

const statusColor = computed(() => {
  return statusColorMap[activeJob.value?.status] || "neutral";
});

const logText = computed(() =>
  jobLogs.value.length
    ? jobLogs.value.join("")
    : "暂无任务日志。"
);
</script>

<template>
  <Surface v-reveal variant="panel" radius="2xl" padding="lg" class="flex flex-col gap-6">
    <header class="flex items-center justify-between gap-3 flex-wrap">
      <div class="flex items-center gap-2.5">
        <span class="grid place-items-center h-8 w-8 rounded-[10px] bg-primary/10 text-primary">
          <ScrollText :size="15" />
        </span>
        <h2 class="type-title-lg text-onSurface">任务日志</h2>
      </div>
      <Chip :color="statusColor" variant="tonal" size="sm" dot>
        {{ activeJob ? statusLabel(activeJob.status) : "空闲" }}
      </Chip>
    </header>

    <div class="rounded-[1.4rem] p-1.5 bg-[rgb(var(--md-surface-container-high)/0.5)] border border-[rgb(var(--md-outline-variant)/0.6)] dark:border-white/8 shadow-elev-2">
      <div class="console-surface rounded-[1.1rem] overflow-hidden border border-black/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        <header class="flex items-center gap-2.5 px-4 py-2.5 bg-white/4 border-b border-white/8">
          <Terminal :size="13" class="text-[#8FA39C]" />
          <span class="type-label-md text-[#B7C9C2]">{{ activeJob ? activeJob.title : "执行日志" }}</span>
        </header>
        <pre class="px-4 py-3.5 min-h-[400px] max-h-[70vh] overflow-auto font-mono type-body-sm leading-relaxed whitespace-pre-wrap">{{ logText }}</pre>
      </div>
    </div>
  </Surface>
</template>
