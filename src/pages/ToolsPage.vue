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
  <div class="flex flex-col gap-5">
    <Surface variant="panel" radius="2xl" padding="lg">
      <header class="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div class="flex items-center gap-2">
          <Wrench :size="18" class="text-primary" />
          <h2 class="type-title-lg text-onSurface">服务器工具</h2>
        </div>
      </header>

      <Select v-model="toolServerId" label="目标服务器" required>
        <option value="" disabled>选择 hook 已就绪的服务器</option>
        <option v-for="server in readyServers" :key="server.id" :value="server.id">
          {{ server.name }}
        </option>
      </Select>
    </Surface>

    <!-- Tool feedback panel -->
    <Surface
      v-if="toolFeedback"
      variant="elevated"
      radius="2xl"
      padding="lg"
      class="flex flex-col gap-4"
    >
      <header class="flex items-center justify-between gap-3 flex-wrap">
        <div class="flex items-center gap-3 min-w-0">
          <span class="grid place-items-center h-9 w-9 rounded-full bg-primaryContainer text-onPrimaryContainer specular-edge">
            <component :is="feedbackIcon" :size="16" :class="['queued', 'running'].includes(toolFeedback.status) ? 'spin' : ''" />
          </span>
          <div class="min-w-0">
            <p class="type-label-md text-onSurfaceVariant">工具反馈</p>
            <p class="type-title-md text-onSurface break-words">{{ toolFeedback.title }}</p>
            <p class="type-body-sm text-onSurfaceVariant">{{ jobTime(toolFeedback) }}</p>
          </div>
        </div>
        <div class="flex items-center gap-2 flex-wrap">
          <Chip :color="statusColor(toolFeedback.status)" variant="tonal" size="sm" dot>
            {{ statusLabel(toolFeedback.status) }}
          </Chip>
          <Button
            v-if="canOpenToolFeedbackResult(toolFeedback)"
            variant="tonal"
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
          <IconButton variant="standard" size="sm" label="清除反馈" @click="clearToolFeedback">
            <X :size="14" />
          </IconButton>
        </div>
      </header>

      <p class="type-body-md text-onSurfaceVariant">{{ toolFeedbackSummary(toolFeedback) }}</p>

      <div
        v-if="toolFeedback.type === 'optimize' && toolFeedback.result && typeof toolFeedback.result === 'object'"
        class="grid gap-2 grid-cols-2 sm:grid-cols-4"
      >
        <div
          v-for="(entry, key) in {
            内核: toolFeedback.result.kernel,
            拥塞控制: toolFeedback.result.congestionControl,
            队列: toolFeedback.result.queueDiscipline,
            ECN: toolFeedback.result.ecn
          }"
          :key="key"
          class="rounded-xl bg-surfaceContainerLow/60 border border-outlineVariant/30 px-3 py-2.5"
        >
          <p class="type-label-md text-onSurfaceVariant">{{ key }}</p>
          <p class="type-title-sm text-onSurface mt-0.5 font-mono">{{ entry ?? "-" }}</p>
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

      <pre
        v-if="toolFeedbackLogExpanded"
        class="max-h-[420px] overflow-auto rounded-2xl bg-surfaceContainerLowest/80 border border-outlineVariant/30 px-4 py-3 font-mono type-body-sm text-onSurface whitespace-pre-wrap"
      >{{ toolFeedbackLogText(toolFeedback) }}</pre>
    </Surface>

    <div class="grid gap-5 grid-cols-1 lg:grid-cols-2">
      <Surface variant="panel" radius="2xl" padding="lg">
        <form class="flex flex-col gap-4" @submit.prevent="runOptimize">
          <header class="flex items-center gap-2">
            <Gauge :size="17" class="text-tertiary" />
            <h3 class="type-title-md text-onSurface">HY2 同源性能优化</h3>
          </header>
          <Select v-model="optimizeAction" label="优化动作">
            <option v-for="action in optimizeActions" :key="action.value" :value="action.value">
              {{ action.label }}
            </option>
          </Select>
          <div
            v-if="rebootOptimizeActions.has(optimizeAction)"
            class="flex items-start gap-2 px-3 py-2 rounded-xl bg-warningContainer text-onWarningContainer"
          >
            <AlertTriangle :size="14" class="shrink-0 mt-0.5" />
            <p class="type-body-sm">
              该动作会改动系统级内核或网络参数,通常需要重启服务器后完全生效。
            </p>
          </div>
          <p v-else class="type-body-sm text-onSurfaceVariant">
            执行入口与 HY2 Python 上游脚本一致,远端 hook 会拉取并运行 Linux-NetSpeed tcpx.sh。
          </p>
          <Button
            type="submit"
            variant="filled"
            :loading="busy"
            :disabled="!toolServerId || !readyServers.length"
          >
            <template #leading>
              <Gauge :size="16" />
            </template>
            执行优化动作
          </Button>
        </form>
      </Surface>

      <Surface variant="panel" radius="2xl" padding="lg">
        <form class="flex flex-col gap-4" @submit.prevent="runIpQuality">
          <header class="flex items-center gap-2">
            <SearchCheck :size="17" class="text-tertiary" />
            <h3 class="type-title-md text-onSurface">IPQuality 体检</h3>
          </header>
          <div class="grid gap-3 grid-cols-1 sm:grid-cols-2">
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
          <div class="flex flex-col gap-2">
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
