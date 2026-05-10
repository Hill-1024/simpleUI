<template>
<div v-if="ipQualityModal" class="modal-backdrop" @click.self="ipQualityModal = null">
        <div class="report-modal">
          <div class="modal-head">
            <div>
              <h2>IPQuality 检测报告</h2>
              <span>{{ ipQualityModal.reports ? "IPv4 / IPv6 分别检测完成" : (ipQualityModal.reportPath || ipQualityModal.logPath || "远端报告") }}</span>
            </div>
            <button type="button" title="关闭" @click="ipQualityModal = null"><X :size="18" /></button>
          </div>
          <div v-if="ipQualityModal.reports" class="report-list">
            <article v-for="report in ipQualityModal.reports" :key="`${report.mode}-${report.reportPath || report.reportUrl}`" class="report-card">
              <strong>{{ report.title || (report.mode === "ipv6" ? "IPv6 报告" : "IPv4 报告") }}</strong>
              <a v-if="report.reportUrl" :href="report.reportUrl" target="_blank" rel="noreferrer">
                {{ report.reportUrl }}
                <ExternalLink :size="15" />
              </a>
              <pre v-else>{{ report.rawOutput || "没有生成在线报告。关闭隐私模式后，IPQuality 会返回 Report.Check.Place 链接。" }}</pre>
            </article>
          </div>
          <template v-else>
            <div v-if="ipQualityModal.reportUrl" class="report-link">
              <span>在线报告</span>
              <a :href="ipQualityModal.reportUrl" target="_blank" rel="noreferrer">
                {{ ipQualityModal.reportUrl }}
                <ExternalLink :size="15" />
              </a>
            </div>
            <iframe v-if="ipQualityModal.reportUrl" class="report-frame" :src="ipQualityModal.reportUrl" title="IPQuality Report"></iframe>
            <pre v-else class="ansi-report">{{ ipQualityModal.rawOutput || "没有生成在线报告。关闭隐私模式后，IPQuality 会返回 Report.Check.Place 链接。" }}</pre>
          </template>
        </div>
      </div>
</template>

<script>
import { useAppBindings } from "../composables/useAppBindings.js";

export default {
  name: "IpQualityReportModal",
  setup() {
    return useAppBindings();
  }
};
</script>
