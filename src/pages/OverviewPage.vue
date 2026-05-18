<script setup>
import { computed } from "vue";
import { RouterLink } from "vue-router";
import {
  Activity,
  Server,
  Radio,
  Network,
  Gauge,
  Cpu,
  Terminal,
  ExternalLink,
  Search,
  Eraser,
  ArrowRight,
  ArrowDownToLine,
  ArrowUpFromLine
} from "lucide-vue-next";
import {
  StatCard,
  Surface,
  Chip,
  Button,
  IconButton,
  CollapseSection,
  EmptyState,
  ProgressBar,
  Select,
  TextField
} from "../components/ui";
import { useAppBindings } from "../composables/useAppBindings.js";

const {
  state,
  fleetHealth,
  fleetOnlinePercent,
  readyServers,
  onlineNodeCount,
  latestSyncAt,
  fmtTime,
  fmtBytes,
  fmtPercent,
  fmtRate,
  avgServerMetrics,
  totalTrafficBytes,
  totalTraffic,
  overviewServers,
  maxServerTraffic,
  topTrafficNodes,
  maxNodeTraffic,
  topRemoteTraffic,
  trafficClientIp,
  nodeName,
  nodeProtocolLabel,
  serverName,
  groupLabel,
  visibleJobs,
  filteredJobs,
  taskSearch,
  taskStatusFilter,
  taskTypeFilter,
  taskStatusOptions,
  taskTypeOptions,
  statusLabel,
  jobKindLabel,
  jobTime,
  jobSummary,
  canOpenJobResult,
  openJobResult,
  clearJobs
} = useAppBindings();

const fleetTone = computed(() => {
  switch (fleetHealth.value?.tone) {
    case "ok":
      return "success";
    case "warn":
      return "warning";
    case "danger":
      return "error";
    default:
      return "neutral";
  }
});

const ringStyle = computed(() => ({
  background: `conic-gradient(rgb(var(--md-primary)) ${fleetOnlinePercent.value * 3.6}deg, rgb(var(--md-surface-container-highest)) 0)`
}));

const statusToColor = {
  succeeded: "success",
  running: "primary",
  failed: "error",
  cancelled: "warning",
  pending: "neutral",
  queued: "neutral"
};

function statusColor(status) {
  return statusToColor[status] || "neutral";
}
</script>

<template>
  <div class="flex flex-col gap-5">
    <!-- Hero -->
    <Surface variant="elevated" radius="2xl" padding="lg" class="overflow-hidden">
      <div class="grid gap-8 md:grid-cols-[1fr_auto] items-center">
        <div class="flex flex-col gap-4 min-w-0">
          <Chip :color="fleetTone" variant="tonal" size="md" dot>
            <Activity :size="14" class="mr-1" />
            {{ fleetHealth.label }}
          </Chip>
          <div>
            <h2 class="type-headline-lg text-onSurface">SimpleUI Fleet</h2>
            <p class="type-body-lg text-onSurfaceVariant mt-2 max-w-xl">{{ fleetHealth.summary }}</p>
          </div>
          <div class="flex gap-2 flex-wrap mt-1">
            <RouterLink :to="{ name: 'servers' }">
              <Button variant="filled" size="md">
                服务器管理
                <template #trailing>
                  <ArrowRight :size="14" />
                </template>
              </Button>
            </RouterLink>
            <RouterLink :to="{ name: 'nodes' }">
              <Button variant="tonal" size="md">查看节点</Button>
            </RouterLink>
          </div>
        </div>

        <div class="flex flex-col items-center gap-3 mx-auto">
          <div
            class="relative grid place-items-center h-40 w-40 rounded-full specular-edge"
            :style="ringStyle"
          >
            <div class="h-32 w-32 rounded-full glass-elevated specular-edge grid place-items-center">
              <strong class="type-headline-md text-onSurface tabular-nums">{{ fleetOnlinePercent }}%</strong>
              <span class="type-label-md text-onSurfaceVariant -mt-1">Hook 在线率</span>
            </div>
          </div>
          <div class="flex flex-col items-center gap-1 type-body-sm text-onSurfaceVariant">
            <span>{{ readyServers.length }} / {{ state.servers.length }} 服务器</span>
            <span>{{ onlineNodeCount }} / {{ state.nodes.length }} 节点在线</span>
            <span class="type-label-sm">同步 {{ fmtTime(latestSyncAt) }}</span>
          </div>
        </div>
      </div>
    </Surface>

    <!-- Metric strip -->
    <div class="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        label="服务器"
        :value="state.servers.length"
        :hint="`${readyServers.length} 台 Hook 就绪`"
        :icon="Server"
        accent="primary"
      />
      <StatCard
        label="节点"
        :value="state.nodes.length"
        :hint="`${onlineNodeCount} 个在线`"
        :icon="Radio"
        accent="secondary"
      />
      <StatCard
        label="连接来源"
        :value="state.connections.length"
        :hint="`${state.remoteTraffic.length} 个客户端 IP`"
        :icon="Network"
        accent="tertiary"
      />
      <StatCard
        label="累计流量"
        :value="fmtBytes(totalTrafficBytes)"
        :hint="`RX ${fmtBytes(totalTraffic.rx)} / TX ${fmtBytes(totalTraffic.tx)}`"
        :icon="Gauge"
        accent="warning"
      />
    </div>

    <!-- Triple panel grid -->
    <div class="grid gap-5 grid-cols-1 xl:grid-cols-[1.4fr_1fr_1fr]">
      <Surface variant="panel" radius="2xl" padding="lg">
        <header class="flex items-baseline justify-between gap-3 mb-4">
          <div class="flex items-center gap-2">
            <Cpu :size="16" class="text-primary" />
            <h3 class="type-title-md text-onSurface">服务器资源</h3>
          </div>
          <p class="type-label-md text-onSurfaceVariant">
            平均 CPU {{ fmtPercent(avgServerMetrics.cpu) }} · 内存 {{ fmtPercent(avgServerMetrics.memory) }} · 磁盘 {{ fmtPercent(avgServerMetrics.disk) }}
          </p>
        </header>
        <EmptyState
          v-if="!overviewServers.length"
          :icon="Server"
          title="尚无运行数据"
          description="服务器接入并完成 Hook 安装后,资源指标会出现在此。"
          compact
        />
        <div v-else class="flex flex-col gap-3">
          <article
            v-for="item in overviewServers"
            :key="item.server.id"
            class="rounded-2xl bg-surfaceContainerLow/60 border border-outlineVariant/30 px-4 py-3.5 transition-all duration-200 hover:bg-surfaceContainerHigh/40 hover:shadow-elev-1"
          >
            <div class="flex items-baseline justify-between gap-3 mb-2.5">
              <div class="min-w-0">
                <p class="type-title-sm text-onSurface break-words">{{ item.server.name }}</p>
                <p class="type-body-sm text-onSurfaceVariant break-words">
                  {{ item.server.location || groupLabel(item.server.group) }} · {{ item.nodes.length }} 节点 · {{ item.activeConnections }} 连接
                </p>
              </div>
              <div class="flex items-center gap-3 text-onSurfaceVariant type-label-sm shrink-0">
                <span class="inline-flex items-center gap-1"><ArrowDownToLine :size="12" />{{ fmtRate(item.server.metrics?.network?.rxRate || 0) }}</span>
                <span class="inline-flex items-center gap-1"><ArrowUpFromLine :size="12" />{{ fmtRate(item.server.metrics?.network?.txRate || 0) }}</span>
              </div>
            </div>
            <div class="grid grid-cols-3 gap-3">
              <ProgressBar
                label="CPU"
                :value="item.server.metrics?.cpu?.usagePercent || 0"
                size="sm"
                :hint="fmtPercent(item.server.metrics?.cpu?.usagePercent)"
              />
              <ProgressBar
                label="Mem"
                :value="item.server.metrics?.memory?.usedPercent || 0"
                size="sm"
                :hint="fmtPercent(item.server.metrics?.memory?.usedPercent)"
              />
              <ProgressBar
                label="Disk"
                :value="item.server.metrics?.disk?.usedPercent || 0"
                size="sm"
                :hint="fmtPercent(item.server.metrics?.disk?.usedPercent)"
              />
            </div>
            <ProgressBar
              v-if="maxServerTraffic > 0"
              class="mt-2.5"
              :value="item.traffic"
              :max="maxServerTraffic"
              size="xs"
              color="secondary"
              :show-value="false"
              :label="''"
            />
          </article>
        </div>
      </Surface>

      <Surface variant="panel" radius="2xl" padding="lg">
        <header class="flex items-baseline justify-between gap-3 mb-4">
          <div class="flex items-center gap-2">
            <Radio :size="16" class="text-tertiary" />
            <h3 class="type-title-md text-onSurface">节点流量</h3>
          </div>
          <Chip variant="outlined" color="tertiary" size="sm">Top {{ topTrafficNodes.length }}</Chip>
        </header>
        <EmptyState
          v-if="!topTrafficNodes.length"
          :icon="Radio"
          title="无节点流量"
          description="节点联机后,流量排名会出现在此。"
          compact
        />
        <div v-else class="flex flex-col gap-2.5">
          <article
            v-for="item in topTrafficNodes"
            :key="item.node.id"
            class="rounded-xl px-3 py-2.5 bg-surfaceContainerLow/60 border border-outlineVariant/20 transition hover:bg-surfaceContainerHigh/40"
          >
            <div class="flex items-baseline justify-between gap-2 mb-1.5">
              <p class="type-title-sm text-onSurface break-words min-w-0">{{ item.node.name }}</p>
              <span class="type-label-md text-tertiary tabular-nums shrink-0">{{ fmtBytes(item.traffic) }}</span>
            </div>
            <p class="type-body-sm text-onSurfaceVariant break-words mb-1.5">
              {{ nodeProtocolLabel(item.node.protocol) }} · {{ serverName(item.node.serverId) }}
            </p>
            <ProgressBar
              :value="item.traffic"
              :max="maxNodeTraffic"
              size="xs"
              color="tertiary"
              :show-value="false"
              :label="''"
            />
          </article>
        </div>
      </Surface>

      <Surface variant="panel" radius="2xl" padding="lg">
        <header class="flex items-baseline justify-between gap-3 mb-4">
          <div class="flex items-center gap-2">
            <Network :size="16" class="text-secondary" />
            <h3 class="type-title-md text-onSurface">客户端 IP</h3>
          </div>
          <Chip variant="outlined" color="secondary" size="sm">{{ state.remoteTraffic.length }} 来源</Chip>
        </header>
        <EmptyState
          v-if="!topRemoteTraffic.length"
          :icon="Network"
          title="无客户端流量"
          description="客户端联机后会按来源 IP 排序展示。"
          compact
        />
        <div v-else class="flex flex-col gap-2">
          <article
            v-for="item in topRemoteTraffic"
            :key="item.id"
            class="rounded-xl px-3 py-2.5 bg-surfaceContainerLow/60 border border-outlineVariant/20 flex items-baseline justify-between gap-2"
          >
            <div class="min-w-0">
              <p class="type-title-sm text-onSurface font-mono break-all">{{ trafficClientIp(item) }}</p>
              <p class="type-body-sm text-onSurfaceVariant break-words">
                IPv{{ item.ipFamily || "-" }} · {{ nodeName(item.nodeId) }}
              </p>
            </div>
            <span class="type-label-md text-secondary tabular-nums shrink-0">{{ fmtBytes(item.total || ((item.rx || 0) + (item.tx || 0))) }}</span>
          </article>
        </div>
      </Surface>
    </div>

    <!-- Task feedback -->
    <CollapseSection
      v-if="visibleJobs.length"
      :title="`任务执行情况 (${filteredJobs.length} / ${visibleJobs.length})`"
      description="近期 Hook 任务,可按类型、状态过滤"
    >
      <template #actions>
        <Button variant="text" size="sm" @click.stop="clearJobs">
          <template #leading>
            <Eraser :size="14" />
          </template>
          清空
        </Button>
      </template>

      <div class="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 mb-4">
        <TextField v-model="taskSearch" label="搜索任务" density="compact">
          <template #leading>
            <Search :size="14" />
          </template>
        </TextField>
        <Select v-model="taskStatusFilter" label="状态" density="compact">
          <option v-for="option in taskStatusOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </Select>
        <Select v-model="taskTypeFilter" label="类型" density="compact">
          <option value="all">全部类型</option>
          <option v-for="option in taskTypeOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </Select>
      </div>

      <EmptyState
        v-if="!filteredJobs.length"
        :icon="Search"
        title="没有匹配任务"
        description="调整过滤条件以查看其他任务。"
        compact
      />
      <div v-else class="flex flex-col gap-2.5">
        <article
          v-for="job in filteredJobs"
          :key="job.id"
          class="rounded-2xl bg-surfaceContainerLow/60 border border-outlineVariant/30 px-4 py-3 transition hover:shadow-elev-1"
        >
          <div class="flex items-start justify-between gap-3 flex-wrap">
            <div class="flex items-start gap-3 min-w-0 flex-1">
              <Chip :color="statusColor(job.status)" variant="tonal" size="sm" dot>
                {{ statusLabel(job.status) }}
              </Chip>
              <div class="min-w-0">
                <p class="type-title-sm text-onSurface break-words">{{ job.title || jobKindLabel(job.type) }}</p>
                <p class="type-body-sm text-onSurfaceVariant break-words">{{ jobKindLabel(job.type) }} · {{ jobTime(job) }}</p>
              </div>
            </div>
            <Button
              v-if="canOpenJobResult(job)"
              variant="text"
              size="sm"
              @click="openJobResult(job)"
            >
              <template #leading>
                <ExternalLink :size="13" />
              </template>
              打开报告
            </Button>
          </div>
          <p v-if="jobSummary(job)" class="type-body-md text-onSurfaceVariant mt-2">
            {{ jobSummary(job) }}
          </p>
        </article>
      </div>
    </CollapseSection>
  </div>
</template>
