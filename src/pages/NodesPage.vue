<script setup>
import {
  Radio,
  Plus,
  Pencil,
  RefreshCcw,
  RotateCw,
  Trash2,
  Eraser
} from "lucide-vue-next";
import {
  Surface,
  Button,
  IconButton,
  Chip,
  Switch,
  EmptyState
} from "../components/ui";
import { useAppBindings } from "../composables/useAppBindings.js";

const {
  state,
  nodeRows,
  nodesGrouped,
  readyServers,
  readyServerIds,
  busy,
  openManualNodeModal,
  isDeployableNode,
  canControlNodeService,
  startEditNode,
  refreshNode,
  serviceNode,
  deleteNode,
  forceClearNode,
  nodeProtocolLabel,
  nodeSourceLabel,
  serverName,
  groupLabel,
  statusLabel,
  fmtBytes,
  fmtTime
} = useAppBindings();

const statusColorMap = {
  online: "success",
  active: "success",
  success: "success",
  offline: "error",
  failed: "error",
  warning: "warning",
  installing: "warning",
  deleting: "error",
  unknown: "neutral"
};

function statusColor(status) {
  return statusColorMap[status] || "neutral";
}
</script>

<template>
  <Surface v-reveal variant="panel" radius="2xl" padding="lg" class="flex flex-col gap-5">
    <header class="flex items-center justify-between gap-3 flex-wrap">
      <div class="flex items-center gap-2.5">
        <span class="grid place-items-center h-8 w-8 rounded-[10px] bg-primary/10 text-primary">
          <Radio :size="15" />
        </span>
        <h2 class="type-title-lg text-onSurface">节点</h2>
        <Chip variant="outlined" size="sm">{{ state.nodes.length }}</Chip>
      </div>
      <div class="flex items-center gap-3.5">
        <Switch v-model="nodesGrouped" label="按分组展示" />
        <Button
          variant="soft"
          size="md"
          :disabled="busy || !readyServers.length"
          @click="openManualNodeModal"
        >
          <template #leading>
            <Plus :size="15" />
          </template>
          添加监控
        </Button>
      </div>
    </header>

    <EmptyState
      v-if="!state.nodes.length"
      :icon="Radio"
      title="还没有节点"
      description="部署节点或手动添加监控后显示在这里。"
    >
      <template #action>
        <Button
          variant="soft"
          :disabled="busy || !readyServers.length"
          @click="openManualNodeModal"
        >
          <template #leading>
            <Plus :size="15" />
          </template>
          添加监控
        </Button>
      </template>
    </EmptyState>

    <div v-else class="overflow-x-auto -mx-1 px-1">
      <table class="w-full border-separate border-spacing-0 min-w-[900px]">
        <thead>
          <tr class="text-left type-eyebrow text-onSurfaceVariant/80">
            <th class="px-3 pb-3 font-semibold">节点</th>
            <th class="px-3 pb-3 font-semibold">分组</th>
            <th class="px-3 pb-3 font-semibold">服务器</th>
            <th class="px-3 pb-3 font-semibold">入口</th>
            <th class="px-3 pb-3 font-semibold">流量</th>
            <th class="px-3 pb-3 font-semibold">在线</th>
            <th class="px-3 pb-3 font-semibold">状态</th>
            <th class="px-3 pb-3 font-semibold text-right">操作</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="row in nodeRows" :key="row.key">
            <tr v-if="row.type === 'group'">
              <td colspan="8" class="px-3 pt-5 pb-2.5">
                <div class="flex items-baseline gap-2">
                  <span class="type-title-sm text-onSurface">{{ row.label }}</span>
                  <span class="type-body-sm text-onSurfaceVariant">{{ row.count }} 个节点</span>
                </div>
              </td>
            </tr>
            <tr v-else class="align-top transition-colors duration-250 hover:bg-[rgb(var(--md-surface-container-high)/0.35)]">
              <td class="px-3 py-3.5 border-t border-[rgb(var(--md-outline-variant)/0.45)] dark:border-white/5">
                <p class="type-title-sm text-onSurface">{{ row.node.name }}</p>
                <p class="type-body-sm text-onSurfaceVariant mt-0.5">
                  {{ nodeProtocolLabel(row.node.protocol) }} · {{ nodeSourceLabel(row.node) }}
                </p>
              </td>
              <td class="px-3 py-3.5 border-t border-[rgb(var(--md-outline-variant)/0.45)] dark:border-white/5">
                <Chip variant="tonal" color="secondary" size="sm">{{ groupLabel(row.node.group) }}</Chip>
              </td>
              <td class="px-3 py-3.5 border-t border-[rgb(var(--md-outline-variant)/0.45)] dark:border-white/5 type-body-md text-onSurface">
                {{ serverName(row.node.serverId) }}
              </td>
              <td class="px-3 py-3.5 border-t border-[rgb(var(--md-outline-variant)/0.45)] dark:border-white/5 type-body-sm font-mono text-onSurfaceVariant max-w-56 break-all">
                {{ row.node.endpoint }}
              </td>
              <td class="px-3 py-3.5 border-t border-[rgb(var(--md-outline-variant)/0.45)] dark:border-white/5 type-body-md tabular-nums text-onSurface">
                {{ fmtBytes((row.node.traffic?.tx || 0) + (row.node.traffic?.rx || 0)) }}
              </td>
              <td class="px-3 py-3.5 border-t border-[rgb(var(--md-outline-variant)/0.45)] dark:border-white/5 type-body-md tabular-nums text-onSurface">
                {{ row.node.onlineUsers || 0 }}
              </td>
              <td class="px-3 py-3.5 border-t border-[rgb(var(--md-outline-variant)/0.45)] dark:border-white/5">
                <div class="flex flex-col gap-1">
                  <Chip :color="statusColor(row.node.status)" variant="tonal" size="sm" dot>
                    {{ statusLabel(row.node.status) }}
                  </Chip>
                  <span class="type-body-sm text-onSurfaceVariant tabular-nums">{{ fmtTime(row.node.lastCheckedAt) }}</span>
                  <span v-if="row.node.lastSyncError" class="type-body-sm text-error">{{ row.node.lastSyncError }}</span>
                </div>
              </td>
              <td class="px-3 py-3.5 border-t border-[rgb(var(--md-outline-variant)/0.45)] dark:border-white/5">
                <div class="flex items-center gap-0.5 justify-end">
                  <IconButton
                    v-if="isDeployableNode(row.node)"
                    variant="standard"
                    size="sm"
                    label="修改节点参数"
                    :disabled="busy || !readyServerIds.has(row.node.serverId)"
                    @click="startEditNode(row.node)"
                  >
                    <Pencil :size="14" />
                  </IconButton>
                  <IconButton
                    variant="standard"
                    size="sm"
                    label="刷新状态"
                    :disabled="!readyServerIds.has(row.node.serverId)"
                    @click="refreshNode(row.node)"
                  >
                    <RefreshCcw :size="14" />
                  </IconButton>
                  <IconButton
                    variant="warning"
                    size="sm"
                    label="重启服务"
                    :disabled="!canControlNodeService(row.node)"
                    @click="serviceNode(row.node, 'restart')"
                  >
                    <RotateCw :size="14" />
                  </IconButton>
                  <IconButton
                    v-if="isDeployableNode(row.node)"
                    variant="danger"
                    size="sm"
                    label="卸载并删除节点"
                    :disabled="busy || !readyServerIds.has(row.node.serverId) || row.node.status === 'deleting'"
                    @click="deleteNode(row.node)"
                  >
                    <Trash2 :size="14" />
                  </IconButton>
                  <IconButton
                    variant="danger"
                    size="sm"
                    :label="row.node.monitorOnly ? '移除监控记录' : '强制清除本地节点记录'"
                    :disabled="busy"
                    @click="forceClearNode(row.node)"
                  >
                    <Eraser :size="14" />
                  </IconButton>
                </div>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
  </Surface>
</template>
