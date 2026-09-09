<script setup>
import { computed } from "vue";
import { ExternalLink } from "lucide-vue-next";
import { Modal, Chip } from "./ui";
import { useAppBindings } from "../composables/useAppBindings.js";

const { ipQualityModal } = useAppBindings();

const isOpen = computed(() => Boolean(ipQualityModal.value));

function close() {
  ipQualityModal.value = null;
}
</script>

<template>
  <Modal
    :open="isOpen"
    size="xl"
    title="IPQuality 检测报告"
    @close="close"
  >
    <div v-if="ipQualityModal?.reports" class="grid gap-4">
      <article
        v-for="report in ipQualityModal.reports"
        :key="`${report.mode}-${report.reportPath || report.reportUrl}`"
        class="rounded-xl bg-[rgb(var(--md-surface-container-high)/0.4)] border border-[rgb(var(--md-outline-variant)/0.5)] dark:border-white/6 p-4"
      >
        <header class="flex items-center justify-between gap-2 mb-3">
          <h3 class="type-title-md text-onSurface">
            {{ report.title || (report.mode === "ipv6" ? "IPv6 报告" : "IPv4 报告") }}
          </h3>
          <Chip variant="outlined" color="primary" size="xs">{{ report.mode || "report" }}</Chip>
        </header>
        <a
          v-if="report.reportUrl"
          :href="report.reportUrl"
          target="_blank"
          rel="noreferrer"
          class="inline-flex items-center gap-1.5 type-body-sm text-primary break-all"
        >
          <span>{{ report.reportUrl }}</span>
          <ExternalLink :size="13" />
        </a>
        <div v-else class="mt-2 rounded-[0.9rem] p-1 bg-[rgb(var(--md-surface-container-high)/0.5)] border border-[rgb(var(--md-outline-variant)/0.5)] dark:border-white/8">
          <pre class="console-surface max-h-[40vh] overflow-auto rounded-[0.7rem] px-3.5 py-2.5 font-mono type-body-sm whitespace-pre-wrap">{{ report.rawOutput || "暂无检测报告。" }}</pre>
        </div>
      </article>
    </div>
    <template v-else-if="ipQualityModal">
      <div
        v-if="ipQualityModal.reportUrl"
        class="rounded-xl bg-[rgb(var(--md-surface-container-high)/0.4)] border border-[rgb(var(--md-outline-variant)/0.5)] dark:border-white/6 px-3.5 py-2.5 mb-4 flex items-center justify-between gap-2"
      >
        <span class="type-label-md text-onSurfaceVariant">在线报告</span>
        <a
          :href="ipQualityModal.reportUrl"
          target="_blank"
          rel="noreferrer"
          class="inline-flex min-w-0 items-center gap-1.5 type-body-sm text-primary break-all"
        >
          <span class="min-w-0 break-all">{{ ipQualityModal.reportUrl }}</span>
          <ExternalLink :size="13" />
        </a>
      </div>
      <iframe
        v-if="ipQualityModal.reportUrl"
        class="w-full h-[60vh] rounded-xl border border-[rgb(var(--md-outline-variant)/0.5)] dark:border-white/8 bg-white"
        :src="ipQualityModal.reportUrl"
        title="IPQuality Report"
      />
      <div v-else class="rounded-[1.2rem] p-1 bg-[rgb(var(--md-surface-container-high)/0.5)] border border-[rgb(var(--md-outline-variant)/0.5)] dark:border-white/8">
        <pre class="console-surface max-h-[60vh] overflow-auto rounded-[0.9rem] px-4 py-3 font-mono type-body-sm whitespace-pre-wrap">{{ ipQualityModal.rawOutput || "暂无检测报告。" }}</pre>
      </div>
    </template>
  </Modal>
</template>
