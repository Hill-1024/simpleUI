<script setup>
import { computed } from "vue";
import {
  Ban,
  ShieldBan,
  Radio,
  ChevronRight,
  ChevronDown,
  Eraser,
  Search,
  Filter,
  ArrowDown,
  ArrowUp
} from "lucide-vue-next";
import {
  Surface,
  Button,
  IconButton,
  Chip,
  TextField,
  Select,
  Switch,
  Segmented,
  Checkbox,
  EmptyState,
  CollapseSection
} from "../components/ui";
import { useAppBindings } from "../composables/useAppBindings.js";

const {
  state,
  sourceIp,
  banNodeModalOpen,
  selectedNodes,
  selectedNodePreview,
  selectedBlacklistRecords,
  blacklistGroupMode,
  blacklistGroupModes,
  blacklistRecordRows,
  blacklistRows,
  activeBlacklistEntries,
  blacklistTargetRows,
  blacklistActiveModeLabel,
  blacklistGroupAllSelected,
  blacklistGroupCollapsed,
  blacklistGroupSelectedCount,
  toggleBlacklistRecord,
  toggleBlacklistGroup,
  toggleBlacklistCollapse,
  selectAllBlacklistRecords,
  clearSelectedBlacklistRecords,
  runBan,
  runSelectedUnban,
  runBlacklistRecordUnban,
  connectionStatsCollapsed,
  connectionStatsGrouped,
  connectionSearch,
  connectionNodeFilter,
  connectionProtocolFilter,
  connectionFamilyFilter,
  connectionSortKey,
  connectionSortDirection,
  connectionSortOptions,
  connectionNodeOptions,
  connectionProtocolOptions,
  filteredRemoteTraffic,
  filteredConnections,
  remoteTrafficRows,
  connectionRows,
  trafficClientIp,
  nodeName,
  fmtBytes,
  fmtTime
} = useAppBindings();

const segmentedOptions = computed(() =>
  blacklistGroupModes.value.map((mode) => ({ label: mode.label, value: mode.value }))
);

function fillBan(ip) {
  sourceIp.value = ip;
}

function openNodePicker() {
  banNodeModalOpen.value = true;
}
</script>

<template>
  <div class="flex flex-col gap-5">
    <!-- Ban panel -->
    <Surface variant="panel" radius="2xl" padding="lg">
      <header class="flex items-center gap-2 mb-4">
        <ShieldBan :size="18" class="text-primary" />
        <h2 class="type-title-lg text-onSurface">客户端流量与封禁</h2>
      </header>

      <div class="grid gap-3 grid-cols-1 lg:grid-cols-[1fr_auto_auto] items-end">
        <TextField
          v-model="sourceIp"
          label="客户端 IP / CIDR"
          placeholder="如 203.0.113.10 或 2001:db8::/64"
        />
        <Button variant="tonal" size="md" @click="openNodePicker">
          <template #leading>
            <Radio :size="15" />
          </template>
          选择节点 ({{ selectedNodes.length }})
        </Button>
        <Button
          variant="danger"
          size="md"
          :disabled="!sourceIp || !selectedNodes.length"
          @click="runBan"
        >
          <template #leading>
            <Ban :size="15" />
          </template>
          在选中节点封禁
        </Button>
      </div>
      <p class="type-body-sm text-onSurfaceVariant mt-3">
        当前应用节点:<span class="text-onSurface">{{ selectedNodePreview }}</span>。封禁动作通过各服务器的持久化 hook 写入防火墙 DROP 规则,不是 WebUI 访问控制。
      </p>
    </Surface>

    <!-- Blacklist records -->
    <Surface variant="panel" radius="2xl" padding="lg">
      <header class="flex items-start justify-between gap-4 mb-4 flex-wrap">
        <div class="min-w-0">
          <h3 class="type-title-md text-onSurface">黑名单记录</h3>
          <p class="type-body-sm text-onSurfaceVariant mt-1">
            封禁 IP {{ blacklistTargetRows.length }} 个,节点记录 {{ activeBlacklistEntries.length }} 条,当前{{ blacklistActiveModeLabel }}
          </p>
        </div>
        <div class="flex items-center gap-2 flex-wrap">
          <Segmented v-model="blacklistGroupMode" :options="segmentedOptions" size="sm" />
          <Button variant="text" size="sm" :disabled="!blacklistRecordRows.length" @click="selectAllBlacklistRecords">
            全选当前
          </Button>
          <Button variant="text" size="sm" :disabled="!selectedBlacklistRecords.length" @click="clearSelectedBlacklistRecords">
            清空
          </Button>
          <Button
            variant="danger"
            size="sm"
            :disabled="!selectedBlacklistRecords.length"
            @click="runSelectedUnban"
          >
            <template #leading>
              <Eraser :size="14" />
            </template>
            解封选中 ({{ selectedBlacklistRecords.length }})
          </Button>
        </div>
      </header>

      <EmptyState
        v-if="!activeBlacklistEntries.length"
        :icon="ShieldBan"
        title="还没有黑名单记录"
        description="封禁或刷新服务器状态后,这里会显示已同步的节点黑名单。"
        compact
      />
      <div v-else class="overflow-x-auto">
        <table class="w-full border-separate border-spacing-0">
          <thead>
            <tr class="text-left type-label-md text-onSurfaceVariant">
              <th class="px-3 py-2 font-medium w-10"></th>
              <th class="px-3 py-2 font-medium">封禁 IP / CIDR</th>
              <th class="px-3 py-2 font-medium">节点</th>
              <th class="px-3 py-2 font-medium">服务器</th>
              <th class="px-3 py-2 font-medium">最近同步</th>
              <th class="px-3 py-2 font-medium text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            <template v-if="blacklistGroupMode === 'node'">
              <template v-for="group in blacklistRows" :key="group.key">
                <tr class="bg-surfaceContainerLow/40">
                  <td class="px-3 py-2.5 border-t border-outlineVariant/40">
                    <Checkbox
                      :model-value="blacklistGroupAllSelected(group)"
                      @change="(v) => toggleBlacklistGroup(group, v)"
                    />
                  </td>
                  <td colspan="5" class="px-3 py-2.5 border-t border-outlineVariant/40">
                    <button
                      type="button"
                      class="state-layer rounded-md inline-flex items-center gap-2 px-2 py-1 type-label-lg"
                      :aria-expanded="!blacklistGroupCollapsed(group.key)"
                      @click="toggleBlacklistCollapse(group.key)"
                    >
                      <component
                        :is="blacklistGroupCollapsed(group.key) ? ChevronRight : ChevronDown"
                        :size="16"
                      />
                      <Chip variant="outlined" color="primary" size="xs">节点分组</Chip>
                      <strong class="text-onSurface">{{ group.title }}</strong>
                      <span class="type-body-sm text-onSurfaceVariant">
                        {{ group.countLabel }} · 已选 {{ blacklistGroupSelectedCount(group) }}
                      </span>
                    </button>
                  </td>
                </tr>
                <template v-if="!blacklistGroupCollapsed(group.key)">
                  <template v-for="nodeRow in group.children" :key="nodeRow.key">
                    <tr class="bg-surfaceContainerLow/20">
                      <td class="px-3 py-2 pl-8 border-t border-outlineVariant/30">
                        <Checkbox
                          :model-value="blacklistGroupAllSelected(nodeRow)"
                          @change="(v) => toggleBlacklistGroup(nodeRow, v)"
                        />
                      </td>
                      <td colspan="5" class="px-3 py-2 border-t border-outlineVariant/30">
                        <button
                          type="button"
                          class="state-layer rounded-md inline-flex items-center gap-2 px-2 py-1 type-label-md"
                          :aria-expanded="!blacklistGroupCollapsed(nodeRow.key)"
                          @click="toggleBlacklistCollapse(nodeRow.key)"
                        >
                          <component
                            :is="blacklistGroupCollapsed(nodeRow.key) ? ChevronRight : ChevronDown"
                            :size="14"
                          />
                          <Chip variant="outlined" size="xs">节点</Chip>
                          <strong class="text-onSurface">{{ nodeRow.title }}</strong>
                          <span class="type-body-sm text-onSurfaceVariant">
                            {{ nodeRow.detail }} · {{ nodeRow.countLabel }} · 已选 {{ blacklistGroupSelectedCount(nodeRow) }}
                          </span>
                        </button>
                      </td>
                    </tr>
                    <template v-if="!blacklistGroupCollapsed(nodeRow.key)">
                      <tr
                        v-for="record in nodeRow.entries"
                        :key="record.key"
                        class="hover:bg-surfaceContainerLow/30"
                      >
                        <td class="px-3 py-2 pl-14 border-t border-outlineVariant/20">
                          <Checkbox
                            :model-value="selectedBlacklistRecords.includes(record.key)"
                            @change="(v) => toggleBlacklistRecord(record.key, v)"
                          />
                        </td>
                        <td class="px-3 py-2 border-t border-outlineVariant/20">
                          <p class="type-body-md font-mono text-onSurface">{{ record.target }}</p>
                          <p class="type-body-sm text-onSurfaceVariant">{{ record.targetDetail }}</p>
                        </td>
                        <td class="px-3 py-2 border-t border-outlineVariant/20">
                          <p class="type-body-md text-onSurface">{{ record.nodeLabel }}</p>
                          <p class="type-body-sm text-onSurfaceVariant">{{ record.nodeDetail }}</p>
                        </td>
                        <td class="px-3 py-2 border-t border-outlineVariant/20 type-body-md text-onSurface">
                          {{ record.serverLabel }}
                        </td>
                        <td class="px-3 py-2 border-t border-outlineVariant/20 type-body-sm text-onSurfaceVariant">
                          {{ fmtTime(record.updatedAt) }}
                        </td>
                        <td class="px-3 py-2 border-t border-outlineVariant/20 text-right">
                          <Button variant="text" size="sm" @click="runBlacklistRecordUnban(record)">
                            解封
                          </Button>
                        </td>
                      </tr>
                    </template>
                  </template>
                </template>
              </template>
            </template>
            <template v-else>
              <template v-for="row in blacklistRows" :key="row.key">
                <tr class="bg-surfaceContainerLow/40">
                  <td class="px-3 py-2.5 border-t border-outlineVariant/40">
                    <Checkbox
                      :model-value="blacklistGroupAllSelected(row)"
                      @change="(v) => toggleBlacklistGroup(row, v)"
                    />
                  </td>
                  <td colspan="5" class="px-3 py-2.5 border-t border-outlineVariant/40">
                    <button
                      type="button"
                      class="state-layer rounded-md inline-flex items-center gap-2 px-2 py-1 type-label-lg"
                      :aria-expanded="!blacklistGroupCollapsed(row.key)"
                      @click="toggleBlacklistCollapse(row.key)"
                    >
                      <component
                        :is="blacklistGroupCollapsed(row.key) ? ChevronRight : ChevronDown"
                        :size="16"
                      />
                      <Chip variant="outlined" color="error" size="xs">IP</Chip>
                      <strong class="text-onSurface font-mono">{{ row.title }}</strong>
                      <span class="type-body-sm text-onSurfaceVariant">
                        {{ row.detail }} · {{ row.countLabel }} · 已选 {{ blacklistGroupSelectedCount(row) }}
                      </span>
                    </button>
                  </td>
                </tr>
                <template v-if="!blacklistGroupCollapsed(row.key)">
                  <tr v-for="record in row.entries" :key="record.key" class="hover:bg-surfaceContainerLow/30">
                    <td class="px-3 py-2 pl-10 border-t border-outlineVariant/20">
                      <Checkbox
                        :model-value="selectedBlacklistRecords.includes(record.key)"
                        @change="(v) => toggleBlacklistRecord(record.key, v)"
                      />
                    </td>
                    <td class="px-3 py-2 border-t border-outlineVariant/20">
                      <p class="type-body-md font-mono text-onSurface">{{ record.target }}</p>
                      <p class="type-body-sm text-onSurfaceVariant">{{ record.targetDetail }}</p>
                    </td>
                    <td class="px-3 py-2 border-t border-outlineVariant/20">
                      <p class="type-body-md text-onSurface">{{ record.nodeLabel }}</p>
                      <p class="type-body-sm text-onSurfaceVariant">{{ record.nodeDetail }}</p>
                    </td>
                    <td class="px-3 py-2 border-t border-outlineVariant/20 type-body-md text-onSurface">
                      {{ record.serverLabel }}
                    </td>
                    <td class="px-3 py-2 border-t border-outlineVariant/20 type-body-sm text-onSurfaceVariant">
                      {{ fmtTime(record.updatedAt) }}
                    </td>
                    <td class="px-3 py-2 border-t border-outlineVariant/20 text-right">
                      <Button variant="text" size="sm" @click="runBlacklistRecordUnban(record)">
                        解封
                      </Button>
                    </td>
                  </tr>
                </template>
              </template>
            </template>
          </tbody>
        </table>
      </div>
    </Surface>

    <!-- Connection statistics -->
    <CollapseSection
      v-model="connectionStatsCollapsed"
      :title="`连接统计 (${filteredRemoteTraffic.length} / ${state.remoteTraffic.length} 客户端 · ${filteredConnections.length} / ${state.connections.length} 实时连接)`"
      description="按客户端 IP 汇总流量,并可查看每条实时连接"
      :default-open="!connectionStatsCollapsed"
    >
      <div class="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 mb-4">
        <TextField v-model="connectionSearch" label="搜索" density="compact">
          <template #leading>
            <Search :size="14" />
          </template>
        </TextField>
        <Select v-model="connectionNodeFilter" label="节点" density="compact">
          <option value="all">全部节点</option>
          <option v-for="option in connectionNodeOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </Select>
        <Select v-model="connectionProtocolFilter" label="协议" density="compact">
          <option value="all">全部协议</option>
          <option v-for="protocol in connectionProtocolOptions" :key="protocol" :value="protocol">
            {{ protocol }}
          </option>
        </Select>
        <Select v-model="connectionFamilyFilter" label="IP 版本" density="compact">
          <option value="all">IPv4 + IPv6</option>
          <option value="4">IPv4</option>
          <option value="6">IPv6</option>
        </Select>
      </div>
      <div class="grid gap-3 grid-cols-1 sm:grid-cols-3 mb-5 items-end">
        <Select v-model="connectionSortKey" label="排序参考" density="compact">
          <option v-for="option in connectionSortOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </Select>
        <Select v-model="connectionSortDirection" label="顺序" density="compact">
          <option value="desc">降序</option>
          <option value="asc">升序</option>
        </Select>
        <Switch v-model="connectionStatsGrouped" label="按节点分组" />
      </div>
      <p class="type-body-sm text-onSurfaceVariant mb-4">
        统计口径:仅统计连接到节点监听端口的客户端入站与回程流量。
      </p>

      <!-- Client traffic table -->
      <div class="mb-2 flex items-center gap-2">
        <h4 class="type-title-sm text-onSurface">客户端流量统计</h4>
        <Chip variant="outlined" size="xs">{{ filteredRemoteTraffic.length }}</Chip>
      </div>
      <EmptyState
        v-if="!state.remoteTraffic.length"
        title="尚无客户端流量"
        description="刷新节点状态后,这里会按客户端 IP 统计 RX / TX 流量。"
        compact
      />
      <EmptyState
        v-else-if="!filteredRemoteTraffic.length"
        title="无匹配结果"
        description="调整过滤条件以查看其他客户端流量。"
        compact
      />
      <div v-else class="overflow-x-auto mb-6">
        <table class="w-full border-separate border-spacing-0">
          <thead>
            <tr class="text-left type-label-md text-onSurfaceVariant">
              <th class="px-3 py-2 font-medium">客户端 IP</th>
              <th class="px-3 py-2 font-medium">节点</th>
              <th class="px-3 py-2 font-medium">RX</th>
              <th class="px-3 py-2 font-medium">TX</th>
              <th class="px-3 py-2 font-medium">总计</th>
              <th class="px-3 py-2 font-medium">连接</th>
              <th class="px-3 py-2 font-medium">协议</th>
              <th class="px-3 py-2 font-medium">刷新</th>
              <th class="px-3 py-2 font-medium text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="row in remoteTrafficRows" :key="row.key">
              <tr v-if="row.type === 'group'">
                <td colspan="9" class="px-3 pt-4 pb-2">
                  <div class="flex items-baseline gap-2">
                    <span class="type-title-sm text-onSurface">{{ row.label }}</span>
                    <span class="type-body-sm text-onSurfaceVariant">{{ row.count }} 个客户端</span>
                  </div>
                </td>
              </tr>
              <tr v-else class="hover:bg-surfaceContainerLow/40">
                <td class="px-3 py-2 border-t border-outlineVariant/30">
                  <p class="type-body-md text-onSurface font-mono">{{ trafficClientIp(row.traffic) }}</p>
                  <p v-if="row.traffic.ipFamily" class="type-body-sm text-onSurfaceVariant">
                    IPv{{ row.traffic.ipFamily }}
                  </p>
                </td>
                <td class="px-3 py-2 border-t border-outlineVariant/30 type-body-md text-onSurface">
                  {{ nodeName(row.traffic.nodeId) }}
                </td>
                <td class="px-3 py-2 border-t border-outlineVariant/30 tabular-nums">{{ fmtBytes(row.traffic.rx) }}</td>
                <td class="px-3 py-2 border-t border-outlineVariant/30 tabular-nums">{{ fmtBytes(row.traffic.tx) }}</td>
                <td class="px-3 py-2 border-t border-outlineVariant/30 tabular-nums type-label-md text-onSurface">
                  {{ fmtBytes(row.traffic.total || ((row.traffic.rx || 0) + (row.traffic.tx || 0))) }}
                </td>
                <td class="px-3 py-2 border-t border-outlineVariant/30 tabular-nums">{{ row.traffic.connections || 0 }}</td>
                <td class="px-3 py-2 border-t border-outlineVariant/30 type-body-sm text-onSurfaceVariant">
                  {{ (row.traffic.protocols || []).join(", ") || "-" }}
                </td>
                <td class="px-3 py-2 border-t border-outlineVariant/30 type-body-sm text-onSurfaceVariant">
                  {{ fmtTime(row.traffic.lastSeenAt) }}
                </td>
                <td class="px-3 py-2 border-t border-outlineVariant/30 text-right">
                  <Button variant="text" size="sm" @click="fillBan(trafficClientIp(row.traffic))">
                    填入封禁
                  </Button>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>

      <!-- Realtime connections -->
      <div class="mb-2 flex items-center gap-2">
        <h4 class="type-title-sm text-onSurface">实时客户端连接</h4>
        <Chip variant="outlined" size="xs">{{ filteredConnections.length }}</Chip>
      </div>
      <EmptyState
        v-if="!state.connections.length"
        title="尚无连接"
        description="刷新节点状态后,这里会显示可封禁的客户端来源 IP。"
        compact
      />
      <EmptyState
        v-else-if="!filteredConnections.length"
        title="无匹配结果"
        description="调整过滤条件以查看其他实时连接。"
        compact
      />
      <div v-else class="overflow-x-auto">
        <table class="w-full border-separate border-spacing-0">
          <thead>
            <tr class="text-left type-label-md text-onSurfaceVariant">
              <th class="px-3 py-2 font-medium">客户端 IP</th>
              <th class="px-3 py-2 font-medium">节点</th>
              <th class="px-3 py-2 font-medium">客户端端点</th>
              <th class="px-3 py-2 font-medium">节点监听</th>
              <th class="px-3 py-2 font-medium">协议</th>
              <th class="px-3 py-2 font-medium">流量</th>
              <th class="px-3 py-2 font-medium">连接</th>
              <th class="px-3 py-2 font-medium text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="row in connectionRows" :key="row.key">
              <tr v-if="row.type === 'group'">
                <td colspan="8" class="px-3 pt-4 pb-2">
                  <div class="flex items-baseline gap-2">
                    <span class="type-title-sm text-onSurface">{{ row.label }}</span>
                    <span class="type-body-sm text-onSurfaceVariant">{{ row.count }} 个客户端</span>
                  </div>
                </td>
              </tr>
              <tr v-else class="hover:bg-surfaceContainerLow/40">
                <td class="px-3 py-2 border-t border-outlineVariant/30">
                  <p class="type-body-md text-onSurface font-mono">{{ row.connection.sourceIp }}</p>
                  <p v-if="row.connection.ipFamily" class="type-body-sm text-onSurfaceVariant">
                    IPv{{ row.connection.ipFamily }}
                  </p>
                </td>
                <td class="px-3 py-2 border-t border-outlineVariant/30 type-body-md text-onSurface">
                  {{ nodeName(row.connection.nodeId) }}
                </td>
                <td class="px-3 py-2 border-t border-outlineVariant/30 type-body-sm font-mono text-onSurfaceVariant">
                  {{ row.connection.remote || "-" }}
                </td>
                <td class="px-3 py-2 border-t border-outlineVariant/30 type-body-sm font-mono text-onSurfaceVariant">
                  {{ row.connection.local || "-" }}
                </td>
                <td class="px-3 py-2 border-t border-outlineVariant/30 type-body-sm text-onSurfaceVariant">
                  {{ (row.connection.protocols || [row.connection.protocol]).filter(Boolean).join(", ") || "-" }}
                </td>
                <td class="px-3 py-2 border-t border-outlineVariant/30 tabular-nums type-label-md text-onSurface">
                  {{ fmtBytes(row.connection.total || ((row.connection.rx || 0) + (row.connection.tx || 0))) }}
                </td>
                <td class="px-3 py-2 border-t border-outlineVariant/30 tabular-nums">{{ row.connection.connections || 1 }}</td>
                <td class="px-3 py-2 border-t border-outlineVariant/30 text-right">
                  <Button variant="text" size="sm" @click="fillBan(row.connection.sourceIp)">填入</Button>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </CollapseSection>
  </div>
</template>
