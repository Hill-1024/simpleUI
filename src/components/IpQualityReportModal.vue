<script setup>
import { computed } from "vue";
import { ExternalLink } from "lucide-vue-next";
import { Modal, Button, Chip } from "./ui";
import { useAppBindings } from "../composables/useAppBindings.js";

const { ipQualityModal } = useAppBindings();

const isOpen = computed(() => Boolean(ipQualityModal.value));
const subtitle = computed(() => {
  if (!ipQualityModal.value) return "";
  if (ipQualityModal.value.reports) return "IPv4 / IPv6 分别检测完成";
  return ipQualityModal.value.reportPath || ipQualityModal.value.logPath || "远端报告";
});

function close() {
  ipQualityModal.value = null;
}
</script>

<template>
  <Modal
    :open="isOpen"
    size="xl"
    title="IPQuality 检测报告"
    :subtitle="subtitle"
    @close="close"
  >
    <div v-if="ipQualityModal?.reports" class="grid gap-3">
      <article
        v-for="report in ipQualityModal.reports"
        :key="`${report.mode}-${report.reportPath || report.reportUrl}`"
        class="rounded-2xl bg-surfaceContainerLow/60 border border-outlineVariant/30 p-4"
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
        <pre
          v-else
          class="max-h-[40vh] overflow-auto bg-surfaceContainerLowest/80 rounded-xl px-3 py-2 mt-2 font-mono type-body-sm text-onSurface whitespace-pre-wrap"
        >{{ report.rawOutput || "没有生成在线报告。关闭隐私模式后,IPQuality 会返回 Report.Check.Place 链接。" }}</pre>
      </article>
    </div>
    <template v-else-if="ipQualityModal">
      <div
        v-if="ipQualityModal.reportUrl"
        class="rounded-xl bg-surfaceContainerLow/60 border border-outlineVariant/30 px-3 py-2 mb-3 flex items-center justify-between gap-2"
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
        class="w-full h-[60vh] rounded-2xl border border-outlineVariant/30 bg-white"
        :src="ipQualityModal.reportUrl"
        title="IPQuality Report"
      />
      <pre
        v-else
        class="max-h-[60vh] overflow-auto bg-surfaceContainerLowest/80 rounded-2xl px-4 py-3 font-mono type-body-sm text-onSurface whitespace-pre-wrap"
      >{{ ipQualityModal.rawOutput || "没有生成在线报告。关闭隐私模式后,IPQuality 会返回 Report.Check.Place 链接。" }}</pre>
    </template>
  </Modal>
</template>
