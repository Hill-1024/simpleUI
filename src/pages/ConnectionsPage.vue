<template>
<section id="connections" class="panel">
        <div class="section-title">
          <div><Ban :size="18" /><h2>客户端流量与封禁</h2></div>
        </div>
        <div class="ban-panel">
          <input v-model="sourceIp" placeholder="客户端 IP/CIDR，如 203.0.113.10 或 2001:db8::/64" />
          <button type="button" class="secondary-button" @click="banNodeModalOpen = true">
            <Wifi :size="16" />选择节点（{{ selectedNodes.length }}）
          </button>
          <button type="button" class="danger-button" :disabled="!sourceIp || !selectedNodes.length" @click="runBan">
            <Ban :size="16" />在选中节点封禁
          </button>
          <small>当前应用节点：{{ selectedNodePreview }}。该动作通过各服务器的持久化 hook 写入防火墙 DROP 规则，不是 WebUI 访问控制。</small>
        </div>

        <div class="blacklist-section">
          <div class="stats-title-row">
            <div>
              <h3 class="subsection-title">黑名单记录</h3>
              <span class="filter-count">封禁 IP {{ blacklistTargetRows.length }} 个，节点记录 {{ activeBlacklistEntries.length }} 条，当前{{ blacklistActiveModeLabel }}</span>
            </div>
            <div class="blacklist-actions">
              <div class="segmented-control" role="group" aria-label="黑名单分组方式">
                <button
                  v-for="mode in blacklistGroupModes"
                  :key="mode.value"
                  type="button"
                  :class="{ active: blacklistGroupMode === mode.value }"
                  :aria-pressed="blacklistGroupMode === mode.value"
                  @click="blacklistGroupMode = mode.value"
                >
                  {{ mode.label }}
                </button>
              </div>
              <button type="button" class="secondary-button" :disabled="!blacklistRecordRows.length" @click="selectAllBlacklistRecords">全选当前记录</button>
              <button type="button" class="secondary-button" :disabled="!selectedBlacklistRecords.length" @click="clearSelectedBlacklistRecords">清空</button>
              <button type="button" class="danger-button" :disabled="!selectedBlacklistRecords.length" @click="runSelectedUnban">
                <Eraser :size="16" />解封选中（{{ selectedBlacklistRecords.length }}）
              </button>
            </div>
          </div>
          <div v-if="!activeBlacklistEntries.length" class="empty-state">还没有同步到黑名单记录。封禁或刷新服务器状态后，这里会显示已同步的节点黑名单。</div>
          <template v-else>
            <div class="table-wrap compact-table stats-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>选择</th>
                    <th>封禁 IP/CIDR</th>
                    <th>节点</th>
                    <th>服务器</th>
                    <th>最近同步</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  <template v-if="blacklistGroupMode === 'node'">
                    <template v-for="group in blacklistRows" :key="group.key">
                      <tr class="blacklist-group-row blacklist-root-row">
                        <td><input type="checkbox" :checked="blacklistGroupAllSelected(group)" @change="toggleBlacklistGroup(group, $event.target.checked)" /></td>
                        <td colspan="5">
                          <button type="button" class="blacklist-collapse-button" :aria-expanded="!blacklistGroupCollapsed(group.key)" @click="toggleBlacklistCollapse(group.key)">
                            <ChevronRight v-if="blacklistGroupCollapsed(group.key)" :size="16" />
                            <ChevronDown v-else :size="16" />
                            <span>节点分组</span>
                            <strong>{{ group.title }}</strong>
                            <small>{{ group.countLabel }} · 已选 {{ blacklistGroupSelectedCount(group) }} 条</small>
                          </button>
                        </td>
                      </tr>
                      <template v-if="!blacklistGroupCollapsed(group.key)">
                        <template v-for="nodeRow in group.children" :key="nodeRow.key">
                          <tr class="blacklist-group-row blacklist-node-row">
                            <td><input type="checkbox" :checked="blacklistGroupAllSelected(nodeRow)" @change="toggleBlacklistGroup(nodeRow, $event.target.checked)" /></td>
                            <td colspan="5">
                              <button type="button" class="blacklist-collapse-button" :aria-expanded="!blacklistGroupCollapsed(nodeRow.key)" @click="toggleBlacklistCollapse(nodeRow.key)">
                                <ChevronRight v-if="blacklistGroupCollapsed(nodeRow.key)" :size="16" />
                                <ChevronDown v-else :size="16" />
                                <span>节点</span>
                                <strong>{{ nodeRow.title }}</strong>
                                <small>{{ nodeRow.detail }} · {{ nodeRow.countLabel }} · 已选 {{ blacklistGroupSelectedCount(nodeRow) }} 条</small>
                              </button>
                            </td>
                          </tr>
                          <template v-if="!blacklistGroupCollapsed(nodeRow.key)">
                            <tr v-for="record in nodeRow.entries" :key="record.key" class="blacklist-record-row blacklist-record-nested-row">
                              <td><input type="checkbox" :checked="selectedBlacklistRecords.includes(record.key)" @change="toggleBlacklistRecord(record.key, $event.target.checked)" /></td>
                              <td><strong>{{ record.target }}</strong><small>{{ record.targetDetail }}</small></td>
                              <td><strong>{{ record.nodeLabel }}</strong><small>{{ record.nodeDetail }}</small></td>
                              <td>{{ record.serverLabel }}</td>
                              <td>{{ fmtTime(record.updatedAt) }}</td>
                              <td><button type="button" class="danger-text" @click="runBlacklistRecordUnban(record)">解封此记录</button></td>
                            </tr>
                          </template>
                        </template>
                      </template>
                    </template>
                  </template>
                  <template v-else>
                    <template v-for="row in blacklistRows" :key="row.key">
                      <tr class="blacklist-group-row blacklist-root-row">
                        <td><input type="checkbox" :checked="blacklistGroupAllSelected(row)" @change="toggleBlacklistGroup(row, $event.target.checked)" /></td>
                        <td colspan="5">
                          <button type="button" class="blacklist-collapse-button" :aria-expanded="!blacklistGroupCollapsed(row.key)" @click="toggleBlacklistCollapse(row.key)">
                            <ChevronRight v-if="blacklistGroupCollapsed(row.key)" :size="16" />
                            <ChevronDown v-else :size="16" />
                            <span>IP</span>
                            <strong>{{ row.title }}</strong>
                            <small>{{ row.detail }} · {{ row.countLabel }} · 已选 {{ blacklistGroupSelectedCount(row) }} 条</small>
                          </button>
                        </td>
                      </tr>
                      <template v-if="!blacklistGroupCollapsed(row.key)">
                        <tr v-for="record in row.entries" :key="record.key" class="blacklist-record-row">
                          <td><input type="checkbox" :checked="selectedBlacklistRecords.includes(record.key)" @change="toggleBlacklistRecord(record.key, $event.target.checked)" /></td>
                          <td><strong>{{ record.target }}</strong><small>{{ record.targetDetail }}</small></td>
                          <td><strong>{{ record.nodeLabel }}</strong><small>{{ record.nodeDetail }}</small></td>
                          <td>{{ record.serverLabel }}</td>
                          <td>{{ fmtTime(record.updatedAt) }}</td>
                          <td><button type="button" class="danger-text" @click="runBlacklistRecordUnban(record)">解封此记录</button></td>
                        </tr>
                      </template>
                    </template>
                  </template>
                </tbody>
              </table>
            </div>
          </template>
        </div>

        <div class="stats-title-row">
          <div>
            <h3 class="subsection-title">连接统计列表</h3>
            <span class="filter-count">客户端 IP {{ filteredRemoteTraffic.length }} / {{ state.remoteTraffic.length }}，实时连接 {{ filteredConnections.length }} / {{ state.connections.length }}</span>
          </div>
          <button class="collapse-button" type="button" :aria-expanded="!connectionStatsCollapsed" @click="connectionStatsCollapsed = !connectionStatsCollapsed">
            <ChevronRight v-if="connectionStatsCollapsed" :size="16" />
            <ChevronDown v-else :size="16" />
            {{ connectionStatsCollapsed ? "展开" : "折叠" }}
          </button>
        </div>

        <div v-if="connectionStatsCollapsed" class="stats-collapsed">
          统计列表已收起，当前过滤命中 {{ filteredRemoteTraffic.length + filteredConnections.length }} 条。
        </div>
        <template v-else>
          <div class="connection-controls">
            <label class="task-search-field">
              <span>搜索</span>
              <div class="input-with-icon">
                <Search :size="15" />
                <input v-model="connectionSearch" placeholder="客户端 IP、节点、协议、本地地址" />
              </div>
            </label>
            <label>
              <span>节点</span>
              <select v-model="connectionNodeFilter">
                <option value="all">全部节点</option>
                <option v-for="option in connectionNodeOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
              </select>
            </label>
            <label>
              <span>协议</span>
              <select v-model="connectionProtocolFilter">
                <option value="all">全部协议</option>
                <option v-for="protocol in connectionProtocolOptions" :key="protocol" :value="protocol">{{ protocol }}</option>
              </select>
            </label>
            <label>
              <span>IP 版本</span>
              <select v-model="connectionFamilyFilter">
                <option value="all">IPv4 + IPv6</option>
                <option value="4">IPv4</option>
                <option value="6">IPv6</option>
              </select>
            </label>
          </div>
          <div class="connection-sort-row">
            <label>
              <span>排序参考</span>
              <select v-model="connectionSortKey">
                <option v-for="option in connectionSortOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
              </select>
            </label>
            <label>
              <span>顺序</span>
              <select v-model="connectionSortDirection">
                <option value="desc">降序</option>
                <option value="asc">升序</option>
              </select>
            </label>
            <label class="toggle-row compact-toggle">
              <input v-model="connectionStatsGrouped" type="checkbox" />
              <span>按节点分组展示</span>
            </label>
            <span class="connection-sort-hint">统计口径：仅统计连接到节点监听端口的客户端入站与回程流量。</span>
          </div>

          <h3 class="subsection-title">客户端流量统计</h3>
          <div v-if="!state.remoteTraffic.length" class="empty-state">刷新节点状态后，这里会按客户端 IP 统计 RX/TX 流量。</div>
          <div v-else-if="!filteredRemoteTraffic.length" class="empty-state">没有符合当前筛选条件的客户端流量记录。</div>
          <div v-else class="table-wrap compact-table stats-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>客户端 IP</th><th>节点</th><th>RX</th><th>TX</th><th>总计</th><th>连接</th><th>协议</th><th>刷新时间</th><th>操作</th>
                </tr>
              </thead>
              <tbody>
                <template v-for="row in remoteTrafficRows" :key="row.key">
                  <tr v-if="row.type === 'group'" class="group-row">
                    <td colspan="9"><strong>{{ row.label }}</strong><span>{{ row.count }} 条客户端 IP</span></td>
                  </tr>
                  <tr v-else>
                    <td><strong>{{ trafficClientIp(row.traffic) }}</strong><small v-if="row.traffic.ipFamily">IPv{{ row.traffic.ipFamily }}</small></td>
                    <td>{{ nodeName(row.traffic.nodeId) }}</td>
                    <td>{{ fmtBytes(row.traffic.rx) }}</td>
                    <td>{{ fmtBytes(row.traffic.tx) }}</td>
                    <td>{{ fmtBytes(row.traffic.total || ((row.traffic.rx || 0) + (row.traffic.tx || 0))) }}</td>
                    <td>{{ row.traffic.connections || 0 }}</td>
                    <td>{{ (row.traffic.protocols || []).join(", ") || "-" }}</td>
                    <td>{{ fmtTime(row.traffic.lastSeenAt) }}</td>
                    <td><button type="button" @click="sourceIp = trafficClientIp(row.traffic)">填入封禁</button></td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>
          <h3 class="subsection-title">实时客户端连接</h3>
          <div v-if="!state.connections.length" class="empty-state">刷新节点状态后，这里会显示可封禁的客户端来源 IP。</div>
          <div v-else-if="!filteredConnections.length" class="empty-state">没有符合当前筛选条件的实时连接。</div>
          <div v-else class="table-wrap compact-table stats-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>客户端 IP</th><th>节点</th><th>客户端端点</th><th>节点监听</th><th>协议</th><th>流量</th><th>连接</th><th>操作</th>
                </tr>
              </thead>
              <tbody>
                <template v-for="row in connectionRows" :key="row.key">
                  <tr v-if="row.type === 'group'" class="group-row">
                    <td colspan="8"><strong>{{ row.label }}</strong><span>{{ row.count }} 个客户端</span></td>
                  </tr>
                  <tr v-else>
                    <td><strong>{{ row.connection.sourceIp }}</strong><small v-if="row.connection.ipFamily">IPv{{ row.connection.ipFamily }}</small></td>
                    <td>{{ nodeName(row.connection.nodeId) }}</td>
                    <td>{{ row.connection.remote || "-" }}</td>
                    <td>{{ row.connection.local || "-" }}</td>
                    <td>{{ (row.connection.protocols || [row.connection.protocol]).filter(Boolean).join(", ") || "-" }}</td>
                    <td>{{ fmtBytes(row.connection.total || ((row.connection.rx || 0) + (row.connection.tx || 0))) }}</td>
                    <td>{{ row.connection.connections || 1 }}</td>
                    <td><button type="button" @click="sourceIp = row.connection.sourceIp">填入</button></td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>
        </template>
      </section>
</template>

<script>
import { useAppBindings } from "../composables/useAppBindings.js";

export default {
  name: "ConnectionsPage",
  setup() {
    return useAppBindings();
  }
};
</script>
