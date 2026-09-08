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
  <Surface variant="panel" radius="2xl" padding="lg" class="flex flex-col gap-4">
    <header class="flex items-center justify-between gap-3 flex-wrap">
      <div class="flex items-center gap-2">
        <ScrollText :size="18" class="text-primary" />
        <h2 class="type-title-lg text-onSurface">任务日志</h2>
      </div>
      <Chip :color="statusColor" variant="tonal" size="sm" dot>
        {{ activeJob ? statusLabel(activeJob.status) : "空闲" }}
      </Chip>
    </header>

    <div class="rounded-2xl overflow-hidden bg-surfaceContainerLowest border border-outlineVariant/30 shadow-elev-1">
      <header class="flex items-center gap-2 px-4 py-2.5 bg-surfaceContainerLow/60 border-b border-outlineVariant/30">
        <Terminal :size="14" class="text-onSurfaceVariant" />
        <span class="type-label-md text-onSurface">{{ activeJob ? activeJob.title : "执行日志" }}</span>
      </header>
      <pre class="px-4 py-3 min-h-[400px] max-h-[70vh] overflow-auto font-mono type-body-sm leading-relaxed text-onSurface whitespace-pre-wrap">{{ logText }}</pre>
    </div>
  </Surface>
</template>
