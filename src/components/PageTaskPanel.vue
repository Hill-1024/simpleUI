<script setup>
import { computed } from "vue";
import {
  Terminal,
  Loader2,
  CircleAlert,
  ShieldCheck,
  ScrollText,
  X
} from "lucide-vue-next";
import { Surface, IconButton, Chip } from "./ui";
import { useAppBindings } from "../composables/useAppBindings.js";

const {
  activePageTaskFeedback,
  activePageTask,
  activePageTaskCards,
  clearPageTaskFeedback,
  statusLabel,
  jobKindLabel,
  jobTime,
  jobSummary,
  taskHasLogs,
  taskLogText
} = useAppBindings();

const visible = computed(
  () => activePageTaskFeedback.value && activePageTaskCards.value.length
);

const statusColorMap = {
  succeeded: "success",
  running: "primary",
  queued: "neutral",
  failed: "error",
  cancelled: "warning"
};

function statusColor(status) {
  return statusColorMap[status] || "neutral";
}

function statusIcon(status) {
  if (["queued", "running"].includes(status)) return Loader2;
  if (status === "failed") return CircleAlert;
  return ShieldCheck;
}

function statusIconClass(status) {
  if (["queued", "running"].includes(status)) return "spin text-primary";
  if (status === "failed") return "text-error";
  return "text-success";
}
</script>

<template>
  <Surface
    v-if="visible"
    v-reveal
    variant="elevated"
    radius="2xl"
    padding="md"
    class="flex flex-col gap-3.5 motion-slide-up"
  >
    <header class="flex items-center justify-between gap-2">
      <div class="flex items-center gap-2.5 min-w-0">
        <span class="grid place-items-center h-8 w-8 rounded-[10px] bg-primary/10 text-primary shrink-0">
          <Terminal :size="15" />
        </span>
        <h3 class="type-title-md text-onSurface break-words">{{ activePageTaskFeedback.title }}</h3>
      </div>
      <div class="flex items-center gap-2 shrink-0">
        <Chip :color="statusColor(activePageTask.status)" variant="tonal" size="sm" dot>
          {{ statusLabel(activePageTask.status) }}
        </Chip>
        <IconButton variant="standard" size="sm" label="关闭任务卡片" @click="clearPageTaskFeedback()">
          <X :size="14" />
        </IconButton>
      </div>
    </header>

    <div class="flex flex-col divide-y divide-[rgb(var(--md-outline-variant)/0.4)] dark:divide-white/5">
      <article
        v-for="job in activePageTaskCards"
        :key="job.id"
        class="py-3 first:pt-0 last:pb-0"
      >
        <div class="flex items-start justify-between gap-2 mb-1.5">
          <div class="flex items-start gap-2.5 min-w-0">
            <component
              :is="statusIcon(job.status)"
              :size="15"
              :class="['shrink-0 mt-0.5', statusIconClass(job.status)]"
            />
            <div class="min-w-0">
              <p class="type-title-sm text-onSurface break-words">{{ job.title }}</p>
              <p class="type-body-sm text-onSurfaceVariant break-words tabular-nums">
                {{ jobKindLabel(job.type) }} · {{ jobTime(job) }}
              </p>
            </div>
          </div>
          <Chip :color="statusColor(job.status)" variant="tonal" size="xs">
            {{ statusLabel(job.status) }}
          </Chip>
        </div>
        <p v-if="jobSummary(job)" class="type-body-md text-onSurfaceVariant">
          {{ jobSummary(job) }}
        </p>
        <details
          v-if="taskHasLogs(job)"
          class="mt-2.5 group"
          :open="['running', 'failed'].includes(job.status)"
        >
          <summary class="cursor-pointer type-label-md text-primary list-none flex items-center gap-1.5 select-none w-fit">
            <ScrollText :size="13" />
            执行日志
          </summary>
          <div class="mt-2 rounded-[0.9rem] p-1 bg-[rgb(var(--md-surface-container-high)/0.5)] border border-[rgb(var(--md-outline-variant)/0.5)] dark:border-white/8">
            <pre class="console-surface max-h-[260px] overflow-auto rounded-[0.65rem] px-3 py-2 font-mono type-body-sm whitespace-pre-wrap">{{ taskLogText(job) }}</pre>
          </div>
        </details>
      </article>
    </div>
  </Surface>
</template>
