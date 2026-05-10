<template>
<section class="overview-page">
        <div class="overview-hero">
          <div class="overview-hero-copy">
            <div :class="`fleet-state state-${fleetHealth.tone}`">
              <Activity :size="16" />
              {{ fleetHealth.label }}
            </div>
            <h2>SimpleUI Fleet</h2>
            <p>{{ fleetHealth.summary }}</p>
            <div class="hero-actions">
              <RouterLink class="primary-link" :to="{ name: 'servers' }">服务器管理</RouterLink>
              <RouterLink :to="{ name: 'nodes' }">查看节点</RouterLink>
            </div>
          </div>
          <div class="fleet-visual">
            <div class="fleet-ring" :style="{ '--online-angle': `${fleetOnlinePercent * 3.6}deg` }">
              <strong>{{ fleetOnlinePercent }}%</strong>
              <span>Hook 在线率</span>
            </div>
            <div class="fleet-visual-meta">
              <span>{{ readyServers.length }} / {{ state.servers.length }} 服务器</span>
              <span>{{ onlineNodeCount }} / {{ state.nodes.length }} 节点在线</span>
              <span>同步 {{ fmtTime(latestSyncAt) }}</span>
            </div>
          </div>
        </div>

        <div class="overview-metrics">
          <article>
            <Server :size="18" />
            <span>服务器</span>
            <strong>{{ state.servers.length }}</strong>
            <small>{{ readyServers.length }} 台 Hook 就绪</small>
          </article>
          <article>
            <Wifi :size="18" />
            <span>节点</span>
            <strong>{{ state.nodes.length }}</strong>
            <small>{{ onlineNodeCount }} 个在线</small>
          </article>
          <article>
            <Network :size="18" />
            <span>连接来源</span>
            <strong>{{ state.connections.length }}</strong>
            <small>{{ state.remoteTraffic.length }} 个客户端 IP</small>
          </article>
          <article>
            <Gauge :size="18" />
            <span>累计流量</span>
            <strong>{{ fmtBytes(totalTrafficBytes) }}</strong>
            <small>RX {{ fmtBytes(totalTraffic.rx) }} / TX {{ fmtBytes(totalTraffic.tx) }}</small>
          </article>
        </div>

        <div class="overview-grid">
          <section class="overview-panel server-health-panel">
            <div class="overview-panel-head">
              <div><Cpu :size="17" /><h3>服务器资源</h3></div>
              <small>平均 CPU {{ fmtPercent(avgServerMetrics.cpu) }} · 内存 {{ fmtPercent(avgServerMetrics.memory) }} · 磁盘 {{ fmtPercent(avgServerMetrics.disk) }}</small>
            </div>
            <div v-if="!overviewServers.length" class="empty-state">还没有服务器运行数据。</div>
            <div v-else class="server-health-list">
              <article v-for="item in overviewServers" :key="item.server.id" class="server-health-row">
                <div>
                  <strong>{{ item.server.name }}</strong>
                  <small>{{ item.server.location || groupLabel(item.server.group) }} · {{ item.nodes.length }} 节点 · {{ item.activeConnections }} 连接</small>
                </div>
                <div class="resource-bars">
                  <div><span>CPU</span><i><b :style="percentStyle(item.server.metrics?.cpu?.usagePercent)" /></i><em>{{ fmtPercent(item.server.metrics?.cpu?.usagePercent) }}</em></div>
                  <div><span>Mem</span><i><b :style="percentStyle(item.server.metrics?.memory?.usedPercent)" /></i><em>{{ fmtPercent(item.server.metrics?.memory?.usedPercent) }}</em></div>
                  <div><span>Disk</span><i><b :style="percentStyle(item.server.metrics?.disk?.usedPercent)" /></i><em>{{ fmtPercent(item.server.metrics?.disk?.usedPercent) }}</em></div>
                </div>
                <div class="traffic-mini">
                  <small>↓ {{ fmtRate(item.server.metrics?.network?.rxRate || 0) }}</small>
                  <small>↑ {{ fmtRate(item.server.metrics?.network?.txRate || 0) }}</small>
                  <div><span :style="percentStyle(item.traffic, maxServerTraffic)" /></div>
                </div>
              </article>
            </div>
          </section>

          <section class="overview-panel node-traffic-panel">
            <div class="overview-panel-head">
              <div><Wifi :size="17" /><h3>节点流量</h3></div>
              <small>Top {{ topTrafficNodes.length }}</small>
            </div>
            <div v-if="!topTrafficNodes.length" class="empty-state">还没有节点流量数据。</div>
            <div v-else class="rank-list">
              <article v-for="item in topTrafficNodes" :key="item.node.id" class="rank-row">
                <div>
                  <strong>{{ item.node.name }}</strong>
                  <small>{{ nodeProtocolLabel(item.node.protocol) }} · {{ serverName(item.node.serverId) }}</small>
                </div>
                <span>{{ fmtBytes(item.traffic) }}</span>
                <i><b :style="percentStyle(item.traffic, maxNodeTraffic)" /></i>
              </article>
            </div>
          </section>

          <section class="overview-panel remote-panel">
            <div class="overview-panel-head">
              <div><Network :size="17" /><h3>客户端 IP</h3></div>
              <small>{{ state.remoteTraffic.length }} 个来源</small>
            </div>
            <div v-if="!topRemoteTraffic.length" class="empty-state">还没有客户端流量统计。</div>
            <div v-else class="remote-list">
              <article v-for="item in topRemoteTraffic" :key="item.id">
                <strong>{{ trafficClientIp(item) }}</strong>
                <small>IPv{{ item.ipFamily || "-" }} · {{ nodeName(item.nodeId) }}</small>
                <span>{{ fmtBytes(item.total || ((item.rx || 0) + (item.tx || 0))) }}</span>
              </article>
            </div>
          </section>
        </div>
      </section>

<section v-if="visibleJobs.length" class="panel task-feedback">
        <div class="section-title">
          <div>
            <Terminal :size="18" />
            <h2>任务执行情况</h2>
            <span class="task-count">{{ filteredJobs.length }} / {{ visibleJobs.length }}</span>
          </div>
          <div class="section-actions">
            <button class="collapse-button" type="button" :aria-expanded="!taskPanelCollapsed" @click="taskPanelCollapsed = !taskPanelCollapsed">
              <ChevronRight v-if="taskPanelCollapsed" :size="16" />
              <ChevronDown v-else :size="16" />
              {{ taskPanelCollapsed ? "展开" : "折叠" }}
            </button>
            <button class="collapse-button danger-text" type="button" @click="clearJobs">
              <Eraser :size="15" />
              清空
            </button>
          </div>
        </div>
        <div v-if="taskPanelCollapsed" class="task-collapsed">
          最近任务已收起，当前过滤结果 {{ filteredJobs.length }} 条。
        </div>
        <template v-else>
          <div class="task-controls">
            <label class="task-search-field">
              <span>搜索</span>
              <div class="input-with-icon">
                <Search :size="15" />
                <input v-model="taskSearch" placeholder="任务名、结果、报告链接" />
              </div>
            </label>
            <label>
              <span>状态</span>
              <select v-model="taskStatusFilter">
                <option v-for="option in taskStatusOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
              </select>
            </label>
            <label>
              <span>类型</span>
              <select v-model="taskTypeFilter">
                <option value="all">全部类型</option>
                <option v-for="option in taskTypeOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
              </select>
            </label>
          </div>
          <div v-if="!filteredJobs.length" class="empty-state task-empty">没有符合当前筛选条件的任务。</div>
          <div v-else class="task-list">
            <article v-for="job in filteredJobs" :key="job.id" class="task-item">
              <div class="task-main">
                <span :class="`pill status-${job.status || 'unknown'}`">{{ statusLabel(job.status) }}</span>
                <div>
                  <strong>{{ job.title || jobKindLabel(job.type) }}</strong>
                  <small>{{ jobKindLabel(job.type) }} · {{ jobTime(job) }}</small>
                </div>
              </div>
              <p>{{ jobSummary(job) }}</p>
              <button v-if="canOpenJobResult(job)" type="button" @click="openJobResult(job)">
                <ExternalLink :size="14" />
                打开报告
              </button>
            </article>
          </div>
        </template>
      </section>
</template>

<script>
import { useAppBindings } from "../composables/useAppBindings.js";

export default {
  name: "OverviewPage",
  setup() {
    return useAppBindings();
  }
};
</script>
