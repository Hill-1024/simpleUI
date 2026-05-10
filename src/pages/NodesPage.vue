<template>
<section id="nodes" class="panel">
        <div class="section-title">
          <div><Wifi :size="18" /><h2>节点</h2></div>
          <button class="secondary-button" type="button" :disabled="busy || !readyServers.length" @click="openManualNodeModal">
            <Plus :size="15" />
            添加监控
          </button>
        </div>
        <div v-if="!state.nodes.length" class="empty-state">还没有节点。可以先部署节点，或把已有 sing-box 节点手动加入监控。</div>
        <template v-else>
          <div class="list-toolbar">
            <label class="toggle-row compact-toggle">
              <input v-model="nodesGrouped" type="checkbox" />
              <span>按分组展示</span>
            </label>
          </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>节点</th><th>分组</th><th>服务器</th><th>入口</th><th>流量</th><th>在线</th><th>状态</th><th>操作</th>
              </tr>
            </thead>
            <tbody>
              <template v-for="row in nodeRows" :key="row.key">
                <tr v-if="row.type === 'group'" class="group-row">
                  <td colspan="8"><strong>{{ row.label }}</strong><span>{{ row.count }} 个节点</span></td>
                </tr>
                <tr v-else>
                  <td><strong>{{ row.node.name }}</strong><small>{{ nodeProtocolLabel(row.node.protocol) }} · {{ nodeSourceLabel(row.node) }}</small></td>
                  <td><span class="group-badge">{{ groupLabel(row.node.group) }}</span></td>
                  <td>{{ serverName(row.node.serverId) }}</td>
                  <td>{{ row.node.endpoint }}</td>
                  <td>{{ fmtBytes((row.node.traffic?.tx || 0) + (row.node.traffic?.rx || 0)) }}</td>
                  <td>{{ row.node.onlineUsers || 0 }}</td>
                  <td class="metric-cell">
                    <span :class="`pill status-${row.node.status || 'unknown'}`">{{ statusLabel(row.node.status) }}</span>
                    <small>{{ fmtTime(row.node.lastCheckedAt) }}</small>
                    <small v-if="row.node.lastSyncError" class="error-text">{{ row.node.lastSyncError }}</small>
                  </td>
                  <td>
                    <div class="row-actions">
                      <button v-if="isDeployableNode(row.node)" type="button" title="修改节点参数" :disabled="busy || !readyServerIds.has(row.node.serverId)" @click="startEditNode(row.node)"><Pencil :size="15" /></button>
                      <button type="button" title="刷新状态" :disabled="!readyServerIds.has(row.node.serverId)" @click="refreshNode(row.node)"><RefreshCcw :size="15" /></button>
                      <button type="button" title="重启服务" :disabled="!canControlNodeService(row.node)" @click="serviceNode(row.node, 'restart')"><RotateCw :size="15" /></button>
                      <button v-if="isDeployableNode(row.node)" class="icon-danger" type="button" title="卸载并删除节点" :disabled="busy || !readyServerIds.has(row.node.serverId) || row.node.status === 'deleting'" @click="deleteNode(row.node)"><Trash2 :size="15" /></button>
                      <button class="icon-danger" type="button" :title="row.node.monitorOnly ? '移除监控记录' : '强制清除本地节点记录'" :disabled="busy" @click="forceClearNode(row.node)"><Eraser :size="15" /></button>
                    </div>
                  </td>
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
  name: "NodesPage",
  setup() {
    return useAppBindings();
  }
};
</script>
