<script setup>
import {
  Search,
  Radio
} from "lucide-vue-next";
import {
  Modal,
  Button,
  Chip,
  TextField,
  Select,
  Switch,
  Checkbox,
  EmptyState
} from "./ui";
import { useAppBindings } from "../composables/useAppBindings.js";

const {
  state,
  banNodeModalOpen,
  banNodeSearch,
  banNodeGroupFilter,
  banNodesGrouped,
  nodeGroupOptions,
  filteredBanNodes,
  banNodeRows,
  selectedNodes,
  toggleNode,
  selectFilteredBanNodes,
  clearSelectedNodes,
  nodeProtocolLabel,
  groupLabel,
  serverName,
  statusLabel
} = useAppBindings();

const statusColorMap = {
  online: "success",
  active: "success",
  offline: "error",
  failed: "error",
  unknown: "neutral"
};

function statusColor(status) {
  return statusColorMap[status] || "neutral";
}
</script>

<template>
  <Modal
    :open="banNodeModalOpen"
    size="xl"
    title="选择封禁节点"
    :subtitle="`已选 ${selectedNodes.length} 个节点`"
    @close="banNodeModalOpen = false"
  >
    <div class="flex flex-col gap-4">
      <div class="grid gap-3 grid-cols-1 sm:grid-cols-[1fr_1fr_auto] items-end">
        <TextField v-model="banNodeSearch" label="搜索" density="compact" placeholder="节点、服务器、入口、协议">
          <template #leading>
            <Search :size="14" />
          </template>
        </TextField>
        <Select v-model="banNodeGroupFilter" label="节点分组" density="compact">
          <option value="all">全部分组</option>
          <option v-for="option in nodeGroupOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </Select>
        <Switch v-model="banNodesGrouped" label="按分组展示" />
      </div>

      <EmptyState
        v-if="!state.nodes.length"
        :icon="Radio"
        title="尚无节点"
        compact
      />
      <EmptyState
        v-else-if="!filteredBanNodes.length"
        title="无匹配结果"
        compact
      />
      <div v-else class="rounded-2xl border border-outlineVariant/30 overflow-hidden max-h-[55vh] overflow-y-auto">
        <table class="w-full border-separate border-spacing-0">
          <thead class="sticky top-0 z-10 bg-surfaceContainer/95 backdrop-blur">
            <tr class="text-left type-label-md text-onSurfaceVariant">
              <th class="px-3 py-2 font-medium w-10"></th>
              <th class="px-3 py-2 font-medium">节点</th>
              <th class="px-3 py-2 font-medium">分组</th>
              <th class="px-3 py-2 font-medium">服务器</th>
              <th class="px-3 py-2 font-medium">入口</th>
              <th class="px-3 py-2 font-medium">状态</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="row in banNodeRows" :key="row.key">
              <tr v-if="row.type === 'group'">
                <td colspan="6" class="px-3 pt-4 pb-2 bg-surfaceContainerLow/30">
                  <div class="flex items-baseline gap-2">
                    <span class="type-title-sm text-onSurface">{{ row.label }}</span>
                    <span class="type-body-sm text-onSurfaceVariant">{{ row.count }} 个节点</span>
                  </div>
                </td>
              </tr>
              <tr v-else class="hover:bg-surfaceContainerLow/40">
                <td class="px-3 py-2 border-t border-outlineVariant/30">
                  <Checkbox
                    :model-value="selectedNodes.includes(row.node.id)"
                    @change="(v) => toggleNode(row.node.id, v)"
                  />
                </td>
                <td class="px-3 py-2 border-t border-outlineVariant/30">
                  <p class="type-title-sm text-onSurface">{{ row.node.name }}</p>
                  <p class="type-body-sm text-onSurfaceVariant">{{ nodeProtocolLabel(row.node.protocol) }}</p>
                </td>
                <td class="px-3 py-2 border-t border-outlineVariant/30">
                  <Chip variant="tonal" color="secondary" size="xs">{{ groupLabel(row.node.group) }}</Chip>
                </td>
                <td class="px-3 py-2 border-t border-outlineVariant/30 type-body-md text-onSurface">
                  {{ serverName(row.node.serverId) }}
                </td>
                <td class="px-3 py-2 border-t border-outlineVariant/30 type-body-sm font-mono text-onSurfaceVariant">
                  {{ row.node.endpoint || "-" }}
                </td>
                <td class="px-3 py-2 border-t border-outlineVariant/30">
                  <Chip :color="statusColor(row.node.status)" variant="tonal" size="xs" dot>
                    {{ statusLabel(row.node.status) }}
                  </Chip>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </div>

    <template #footer>
      <Button variant="text" @click="selectFilteredBanNodes">全选当前筛选</Button>
      <Button variant="text" @click="clearSelectedNodes" class="text-error">清空选择</Button>
      <Button variant="filled" @click="banNodeModalOpen = false">完成</Button>
    </template>
  </Modal>
</template>
