<template>
<section id="tools" class="panel">
        <div class="section-title">
          <div><Gauge :size="18" /><h2>服务器工具</h2></div>
        </div>
        <div class="tool-target">
          <label>
            <span>目标服务器</span>
            <select v-model="toolServerId" required>
              <option value="" disabled>选择 hook 已就绪的服务器</option>
              <option v-for="server in readyServers" :key="server.id" :value="server.id">{{ server.name }}</option>
            </select>
          </label>
        </div>
        <div v-if="toolFeedback" class="tool-feedback">
          <div class="tool-feedback-head">
            <div class="tool-feedback-title">
              <span>
                <Loader2 v-if="['queued', 'running'].includes(toolFeedback.status)" class="spin" :size="15" />
                <CircleAlert v-else-if="toolFeedback.status === 'failed'" :size="15" />
                <PackageCheck v-else :size="15" />
                工具反馈
              </span>
              <strong>{{ toolFeedback.title }}</strong>
              <small>{{ jobTime(toolFeedback) }}</small>
            </div>
            <div class="tool-feedback-actions">
              <span :class="`pill status-${toolFeedback.status || 'unknown'}`">{{ statusLabel(toolFeedback.status) }}</span>
              <button v-if="canOpenToolFeedbackResult(toolFeedback)" type="button" @click="openToolFeedbackResult(toolFeedback)">
                <ExternalLink :size="15" />查看报告
              </button>
              <button type="button" @click="toolFeedbackLogExpanded = !toolFeedbackLogExpanded">
                <Terminal :size="15" />{{ toolFeedbackLogExpanded ? "收起输出" : "展开输出" }}
              </button>
              <button type="button" title="清除反馈" @click="clearToolFeedback"><X :size="15" /></button>
            </div>
          </div>
          <p>{{ toolFeedbackSummary(toolFeedback) }}</p>
          <div v-if="toolFeedback.type === 'optimize' && toolFeedback.result && typeof toolFeedback.result === 'object'" class="tool-result-grid">
            <span><small>内核</small><strong>{{ toolFeedback.result.kernel || "-" }}</strong></span>
            <span><small>拥塞控制</small><strong>{{ toolFeedback.result.congestionControl || "-" }}</strong></span>
            <span><small>队列</small><strong>{{ toolFeedback.result.queueDiscipline || "-" }}</strong></span>
            <span><small>ECN</small><strong>{{ toolFeedback.result.ecn ?? "-" }}</strong></span>
          </div>
          <div v-if="toolFeedbackReports(toolFeedback).length" class="tool-report-strip">
            <button v-for="report in toolFeedbackReports(toolFeedback)" :key="report.title || report.mode || report.reportUrl || report.reportPath" type="button" @click="openToolReport(report)">
              <SearchCheck :size="15" />{{ report.title || report.mode || "IPQuality 报告" }}
            </button>
          </div>
          <pre v-if="toolFeedbackLogExpanded" class="tool-feedback-log">{{ toolFeedbackLogText(toolFeedback) }}</pre>
        </div>
        <div class="tools-layout">
          <form class="tool-block" @submit.prevent="runOptimize">
            <div class="tool-heading"><Gauge :size="17" /><h3>HY2 同源性能优化</h3></div>
            <label>
              <span>优化动作</span>
              <select v-model="optimizeAction">
                <option v-for="action in optimizeActions" :key="action.value" :value="action.value">{{ action.label }}</option>
              </select>
            </label>
            <p v-if="rebootOptimizeActions.has(optimizeAction)" class="form-note warning-note">该动作会改动系统级内核或网络参数，通常需要重启服务器后完全生效。</p>
            <p v-else class="form-note">执行入口与 HY2 Python 上游脚本一致，远端 hook 会拉取并运行 Linux-NetSpeed tcpx.sh。</p>
            <button class="primary-button" type="submit" :disabled="busy || !toolServerId || !readyServers.length">
              <Loader2 v-if="busy" class="spin" :size="16" />
              <Gauge v-else :size="16" />
              执行优化动作
            </button>
          </form>

          <form class="tool-block" @submit.prevent="runIpQuality">
            <div class="tool-heading"><SearchCheck :size="17" /><h3>IPQuality 体检</h3></div>
            <div class="tool-grid">
              <label>
                <span>检测模式</span>
                <select v-model="ipQualityForm.mode">
                  <option value="dual">IPv4 + IPv6</option>
                  <option value="ipv4">仅 IPv4</option>
                  <option value="ipv6">仅 IPv6</option>
                </select>
              </label>
              <label>
                <span>语言</span>
                <select v-model="ipQualityForm.language">
                  <option value="cn">中文</option>
                  <option value="en">English</option>
                  <option value="jp">日本語</option>
                  <option value="es">Español</option>
                  <option value="de">Deutsch</option>
                  <option value="fr">Français</option>
                  <option value="ru">Русский</option>
                  <option value="pt">Português</option>
                </select>
              </label>
              <label><span>网卡 / 出口 IP</span><input v-model="ipQualityForm.interface" placeholder="可选，如 eth0 或 203.0.113.10" /></label>
              <label><span>HTTP/SOCKS 代理</span><input v-model="ipQualityForm.proxy" type="password" placeholder="可选" /></label>
            </div>
            <div class="tool-toggles">
              <label class="toggle-row">
                <input v-model="ipQualityForm.privacy" type="checkbox" />
                <span>隐私模式（不生成报告链接）</span>
              </label>
              <label class="toggle-row">
                <input v-model="ipQualityForm.fullIp" type="checkbox" />
                <span>报告显示完整 IP</span>
              </label>
            </div>
            <button class="primary-button" type="submit" :disabled="busy || !toolServerId || !readyServers.length">
              <Loader2 v-if="busy" class="spin" :size="16" />
              <SearchCheck v-else :size="16" />
              运行 IPQuality
            </button>
          </form>
        </div>
      </section>
</template>

<script>
import { useAppBindings } from "../composables/useAppBindings.js";

export default {
  name: "ToolsPage",
  setup() {
    return useAppBindings();
  }
};
</script>
