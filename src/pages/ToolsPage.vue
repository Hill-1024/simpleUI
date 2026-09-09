<script setup>
import { computed } from "vue";
import {
  Wrench,
  Gauge,
  SearchCheck,
  ExternalLink,
  Terminal,
  X,
  Loader2,
  CircleAlert,
  PackageCheck,
  AlertTriangle
} from "lucide-vue-next";
import {
  Surface,
  Button,
  IconButton,
  Chip,
  TextField,
  Select,
  Switch
} from "../components/ui";
import { useAppBindings } from "../composables/useAppBindings.js";

const {
  toolServerId,
  toolFeedback,
  toolFeedbackLogExpanded,
  optimizeAction,
  optimizeActions,
  rebootOptimizeActions,
  ipQualityForm,
  readyServers,
  busy,
  runOptimize,
  runIpQuality,
  clearToolFeedback,
  jobTime,
  statusLabel,
  canOpenToolFeedbackResult,
  openToolFeedbackResult,
  toolFeedbackReports,
  openToolReport,
  toolFeedbackSummary,
  toolFeedbackLogText
} = useAppBindings();

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

const feedbackIcon = computed(() => {
  if (!toolFeedback.value) return PackageCheck;
  if (["queued", "running"].includes(toolFeedback.value.status)) return Loader2;
  if (toolFeedback.value.status === "failed") return CircleAlert;
  return PackageCheck;
});
</script>

<template>
  <div class="flex flex-col gap-6">
    <!-- Tool feedback panel -->
    <Surface
      v-if="toolFeedback"
      v-reveal
      variant="elevated"
      radius="2xl"
      padding="lg"
      class="flex flex-col gap-5"
    >
      <header class="flex items-center justify-between gap-3 flex-wrap">
        <div class="flex items-center gap-3 min-w-0">
          <span class="grid place-items-center h-10 w-10 rounded-xl bg-primaryContainer text-onPrimaryContainer specular-ring">
            <component :is="feedbackIcon" :size="17" :class="['queued', 'running'].includes(toolFeedback.status) ? 'spin' : ''" />
          </span>
          <div class="min-w-0">
            <p class="type-eyebrow text-onSurfaceVariant/85">工具任务</p>
            <p class="type-title-md text-onSurface break-words">{{ toolFeedback.title }}</p>
            <p class="type-body-sm text-onSurfaceVariant tabular-nums">{{ jobTime(toolFeedback) }}</p>
          </div>
        </div>
        <div class="flex items-center gap-2 flex-wrap">
          <Chip :color="statusColor(toolFeedback.status)" variant="tonal" size="sm" dot>
            {{ statusLabel(toolFeedback.status) }}
          </Chip>
          <Button
            v-if="canOpenToolFeedbackResult(toolFeedback)"
            variant="soft"
            size="sm"
            @click="openToolFeedbackResult(toolFeedback)"
          >
            <template #leading>
              <ExternalLink :size="14" />
            </template>
            查看报告
          </Button>
          <Button
            variant="text"
            size="sm"
            @click="toolFeedbackLogExpanded = !toolFeedbackLogExpanded"
          >
            <template #leading>
              <Terminal :size="14" />
            </template>
            {{ toolFeedbackLogExpanded ? "收起输出" : "展开输出" }}
          </Button>
          <IconButton variant="standard" size="sm" label="关闭任务卡片" @click="clearToolFeedback">
            <X :size="14" />
          </IconButton>
        </div>
      </header>

      <p class="type-body-md text-onSurfaceVariant">{{ toolFeedbackSummary(toolFeedback) }}</p>

      <div
        v-if="toolFeedback.type === 'optimize' && toolFeedback.result && typeof toolFeedback.result === 'object'"
        class="grid gap-2.5 grid-cols-2 sm:grid-cols-4"
      >
        <div
          v-for="(entry, key) in {
            内核: toolFeedback.result.kernel,
            拥塞控制: toolFeedback.result.congestionControl,
            队列: toolFeedback.result.queueDiscipline,
            ECN: toolFeedback.result.ecn
          }"
          :key="key"
          class="rounded-xl bg-[rgb(var(--md-surface-container-high)/0.45)] border border-[rgb(var(--md-outline-variant)/0.5)] dark:border-white/6 px-3.5 py-3"
        >
          <p class="type-eyebrow text-onSurfaceVariant/80">{{ key }}</p>
          <p class="type-title-sm text-onSurface mt-1 font-mono">{{ entry ?? "-" }}</p>
        </div>
      </div>

      <div v-if="toolFeedbackReports(toolFeedback).length" class="flex flex-wrap gap-2">
        <Button
          v-for="report in toolFeedbackReports(toolFeedback)"
          :key="report.title || report.mode || report.reportUrl || report.reportPath"
          variant="outlined"
          size="sm"
          @click="openToolReport(report)"
        >
          <template #leading>
            <SearchCheck :size="14" />
          </template>
          {{ report.title || report.mode || "IPQuality 报告" }}
        </Button>
      </div>

      <div
        v-if="toolFeedbackLogExpanded"
        class="rounded-[1.2rem] p-1.5 bg-[rgb(var(--md-surface-container-high)/0.5)] border border-[rgb(var(--md-outline-variant)/0.6)] dark:border-white/8"
      >
        <pre class="console-surface max-h-[420px] overflow-auto rounded-[0.9rem] border border-black/40 px-4 py-3 font-mono type-body-sm whitespace-pre-wrap">{{ toolFeedbackLogText(toolFeedback) }}</pre>
      </div>
    </Surface>

    <div class="grid gap-5 grid-cols-1 lg:grid-cols-2 lg:items-start">
      <!-- Performance -->
      <Surface v-reveal="70" variant="panel" radius="2xl" padding="lg">
        <form class="flex flex-col gap-5" @submit.prevent="runOptimize">
          <header class="flex items-center gap-2.5">
            <span class="grid place-items-center h-8 w-8 rounded-[10px] bg-tertiary/10 text-tertiary">
              <Gauge :size="15" />
            </span>
            <h3 class="type-title-md text-onSurface">性能优化</h3>
          </header>
          <Select v-model="toolServerId" label="目标服务器" required>
            <option value="" disabled>选择服务器</option>
            <option v-for="server in readyServers" :key="server.id" :value="server.id">
              {{ server.name }}
            </option>
          </Select>
          <Select v-model="optimizeAction" label="优化动作">
            <option v-for="action in optimizeActions" :key="action.value" :value="action.value">
              {{ action.label }}
            </option>
          </Select>
          <div
            v-if="rebootOptimizeActions.has(optimizeAction)"
            class="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-warningContainer text-onWarningContainer"
          >
            <AlertTriangle :size="14" class="shrink-0 mt-0.5" />
            <p class="type-body-sm">
              此操作会修改内核或网络参数，通常需要重启服务器。
            </p>
          </div>
          <Button
            type="submit"
            variant="filled"
            :loading="busy"
            :disabled="!toolServerId || !readyServers.length"
          >
            <template #leading>
              <Gauge :size="16" />
            </template>
            执行
          </Button>
        </form>
      </Surface>

      <!-- IPQuality -->
      <Surface v-reveal="140" variant="panel" radius="2xl" padding="lg">
        <form class="flex flex-col gap-5" @submit.prevent="runIpQuality">
          <header class="flex items-center gap-2.5">
            <span class="grid place-items-center h-8 w-8 rounded-[10px] bg-tertiary/10 text-tertiary">
              <SearchCheck :size="15" />
            </span>
            <h3 class="type-title-md text-onSurface">IPQuality 体检</h3>
          </header>
          <Select v-model="toolServerId" label="目标服务器" required>
            <option value="" disabled>选择服务器</option>
            <option v-for="server in readyServers" :key="server.id" :value="server.id">
              {{ server.name }}
            </option>
          </Select>
          <div class="grid gap-3.5 grid-cols-1 sm:grid-cols-2">
            <Select v-model="ipQualityForm.mode" label="检测模式">
              <option value="dual">IPv4 + IPv6</option>
              <option value="ipv4">仅 IPv4</option>
              <option value="ipv6">仅 IPv6</option>
            </Select>
            <Select v-model="ipQualityForm.language" label="语言">
              <option value="cn">中文</option>
              <option value="en">English</option>
              <option value="jp">日本語</option>
              <option value="es">Español</option>
              <option value="de">Deutsch</option>
              <option value="fr">Français</option>
              <option value="ru">Русский</option>
              <option value="pt">Português</option>
            </Select>
            <TextField
              v-model="ipQualityForm.interface"
              label="网卡 / 出口 IP"
              placeholder="可选,如 eth0 或 203.0.113.10"
            />
            <TextField
              v-model="ipQualityForm.proxy"
              label="HTTP / SOCKS 代理"
              type="password"
              placeholder="可选"
            />
          </div>
          <div class="flex flex-col gap-2.5">
            <Switch v-model="ipQualityForm.privacy" label="隐私模式 (不生成报告链接)" />
            <Switch v-model="ipQualityForm.fullIp" label="报告显示完整 IP" />
          </div>
          <Button
            type="submit"
            variant="filled"
            :loading="busy"
            :disabled="!toolServerId || !readyServers.length"
          >
            <template #leading>
              <SearchCheck :size="16" />
            </template>
            运行 IPQuality
          </Button>
        </form>
      </Surface>
    </div>
  </div>
</template>
