<template>
<div v-if="banNodeModalOpen" class="modal-backdrop" @click.self="banNodeModalOpen = false">
        <div class="node-select-modal">
          <div class="modal-head">
            <div>
              <h2>选择封禁应用节点</h2>
              <span>已选 {{ selectedNodes.length }} 个节点；封禁会下发到这些节点所在服务器的 hook。</span>
            </div>
            <button type="button" title="关闭" @click="banNodeModalOpen = false"><X :size="18" /></button>
          </div>
          <div class="node-select-controls">
            <label class="task-search-field">
              <span>搜索</span>
              <div class="input-with-icon">
                <Search :size="15" />
                <input v-model="banNodeSearch" placeholder="节点、服务器、入口、协议" />
              </div>
            </label>
            <label>
              <span>节点分组</span>
              <select v-model="banNodeGroupFilter">
                <option value="all">全部分组</option>
                <option v-for="option in nodeGroupOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
              </select>
            </label>
            <label class="toggle-row compact-toggle">
              <input v-model="banNodesGrouped" type="checkbox" />
              <span>按分组展示</span>
            </label>
          </div>
          <div v-if="!state.nodes.length" class="empty-state modal-empty">还没有节点可以选择。</div>
          <div v-else-if="!filteredBanNodes.length" class="empty-state modal-empty">没有符合当前筛选条件的节点。</div>
          <div v-else class="table-wrap compact-table node-select-table">
            <table>
              <thead>
                <tr><th>选择</th><th>节点</th><th>分组</th><th>服务器</th><th>入口</th><th>状态</th></tr>
              </thead>
              <tbody>
                <template v-for="row in banNodeRows" :key="row.key">
                  <tr v-if="row.type === 'group'" class="group-row">
                    <td colspan="6"><strong>{{ row.label }}</strong><span>{{ row.count }} 个节点</span></td>
                  </tr>
                  <tr v-else>
                    <td><input type="checkbox" :checked="selectedNodes.includes(row.node.id)" @change="toggleNode(row.node.id, $event.target.checked)" /></td>
                    <td><strong>{{ row.node.name }}</strong><small>{{ nodeProtocolLabel(row.node.protocol) }}</small></td>
                    <td><span class="group-badge">{{ groupLabel(row.node.group) }}</span></td>
                    <td>{{ serverName(row.node.serverId) }}</td>
                    <td>{{ row.node.endpoint || "-" }}</td>
                    <td><span :class="`pill status-${row.node.status || 'unknown'}`">{{ statusLabel(row.node.status) }}</span></td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>
          <div class="modal-actions">
            <button type="button" class="secondary-button" @click="selectFilteredBanNodes">全选当前筛选</button>
            <button type="button" class="secondary-button danger-text" @click="clearSelectedNodes">清空选择</button>
            <button type="button" class="primary-button" @click="banNodeModalOpen = false">完成</button>
          </div>
        </div>
      </div>
</template>

<script>
import { useAppBindings } from "../composables/useAppBindings.js";

export default {
  name: "BanNodeModal",
  setup() {
    return useAppBindings();
  }
};
</script>
