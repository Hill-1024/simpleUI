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
    variant="elevated"
    radius="2xl"
    padding="md"
    class="flex flex-col gap-3 motion-slide-up"
  >
    <header class="flex items-center justify-between gap-2">
      <div class="flex items-center gap-2 min-w-0">
        <Terminal :size="16" class="text-primary shrink-0" />
        <h3 class="type-title-md text-onSurface break-words">{{ activePageTaskFeedback.title }}</h3>
      </div>
      <div class="flex items-center gap-2 shrink-0">
        <Chip :color="statusColor(activePageTask.status)" variant="tonal" size="sm" dot>
          {{ statusLabel(activePageTask.status) }}
        </Chip>
        <IconButton variant="standard" size="sm" label="清除反馈" @click="clearPageTaskFeedback()">
          <X :size="14" />
        </IconButton>
      </div>
    </header>

    <div class="flex flex-col gap-2.5">
      <article
        v-for="job in activePageTaskCards"
        :key="job.id"
        class="rounded-2xl bg-surfaceContainerLow/60 border border-outlineVariant/30 px-4 py-3"
      >
        <div class="flex items-start justify-between gap-2 mb-1.5">
          <div class="flex items-start gap-2.5 min-w-0">
            <component
              :is="statusIcon(job.status)"
              :size="16"
              :class="['shrink-0 mt-0.5', statusIconClass(job.status)]"
            />
            <div class="min-w-0">
              <p class="type-title-sm text-onSurface break-words">{{ job.title }}</p>
              <p class="type-body-sm text-onSurfaceVariant break-words">
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
          class="mt-2 group"
          :open="['running', 'failed'].includes(job.status)"
        >
          <summary class="cursor-pointer type-label-md text-primary list-none flex items-center gap-1.5 select-none">
            <ScrollText :size="13" />
            Hook 输出
          </summary>
          <pre
            class="mt-2 max-h-[260px] overflow-auto rounded-xl bg-surfaceContainerLowest/80 border border-outlineVariant/30 px-3 py-2 font-mono type-body-sm whitespace-pre-wrap"
          >{{ taskLogText(job) }}</pre>
        </details>
      </article>
    </div>
  </Surface>
</template>
