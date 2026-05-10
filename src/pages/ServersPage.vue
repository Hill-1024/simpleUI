<template>
<section id="servers" class="panel">
        <div class="section-title">
          <div><Server :size="18" /><h2>服务器 hooks</h2></div>
        </div>
        <form class="server-install" @submit.prevent="installServer">
          <p v-if="serverForm.id" class="form-note warning-note">正在通过 SSH 重装 {{ serverForm.name }} 的持久化 hook；只有首次接入、hook 离线或旧 hook 不支持在线升级时才需要这条路径。</p>
          <div class="form-grid server-grid">
            <label><span>服务器名</span><input v-model="serverForm.name" required /></label>
            <label><span>服务器分组</span><input v-model="serverForm.group" placeholder="可选，如 Osaka / HK" /></label>
            <label><span>SSH 主机</span><input v-model="serverForm.host" placeholder="IPv4、域名或 [IPv6]" required /></label>
            <label><span>SSH 端口</span><input v-model.number="serverForm.port" type="number" /></label>
            <label><span>SSH 用户</span><input v-model="serverCredential.username" required /></label>
            <label><span>SSH 密码</span><input v-model="serverCredential.password" type="password" /></label>
            <label><span>Hook 端口</span><input v-model.number="serverForm.hookPort" type="number" /></label>
            <label><span>地区</span><input v-model="serverForm.location" placeholder="可选" /></label>
          </div>
          <p class="form-note">SSH 凭据只用于 bootstrap 或离线恢复；hook 在线后可直接在服务器列表中执行在线升级。</p>
          <button class="primary-button" type="submit" :disabled="busy">
            <Loader2 v-if="busy" class="spin" :size="16" />
            <ShieldCheck v-else :size="16" />
            {{ serverForm.id ? "通过 SSH 重装 hook" : "添加服务器并安装 hook" }}
          </button>
          <button v-if="serverForm.id" class="secondary-button" type="button" :disabled="busy" @click="resetServerForm">
            <X :size="15" />
            取消升级
          </button>
        </form>
        <div v-if="!state.servers.length" class="empty-state">还没有服务器。先添加服务器并等待 hook 安装完成。</div>
        <template v-else>
          <div class="list-toolbar">
            <label class="toggle-row compact-toggle">
              <input v-model="serversGrouped" type="checkbox" />
              <span>按分组展示</span>
            </label>
          </div>
        <div class="table-wrap server-table">
          <table>
            <thead>
              <tr><th>服务器</th><th>分组</th><th>主机</th><th>资源</th><th>网络</th><th>状态</th><th>地区</th><th>同步</th><th>操作</th></tr>
            </thead>
            <tbody>
              <template v-for="row in serverRows" :key="row.key">
                <tr v-if="row.type === 'group'" class="group-row">
                  <td colspan="9"><strong>{{ row.label }}</strong><span>{{ row.count }} 台服务器</span></td>
                </tr>
                <tr v-else>
                  <td v-if="editingServerId === row.server.id">
                    <input v-model="serverEditForm.name" class="inline-input" required />
                    <small>{{ row.server.sshUserHint || "root" }}@{{ row.server.host }}</small>
                  </td>
                  <td v-else><strong>{{ row.server.name }}</strong><small>{{ row.server.sshUserHint || "root" }}@{{ row.server.host }}</small></td>
                  <td v-if="editingServerId === row.server.id"><input v-model="serverEditForm.group" class="inline-input short-input" placeholder="可选" /></td>
                  <td v-else><span class="group-badge">{{ groupLabel(row.server.group) }}</span></td>
                  <td v-if="editingServerId === row.server.id" class="inline-fields">
                    <input v-model="serverEditForm.host" class="inline-input" required />
                    <input v-model.number="serverEditForm.port" class="inline-input short-input" type="number" />
                  </td>
                  <td v-else>{{ row.server.host }}:{{ row.server.port || 22 }}</td>
                  <td class="metric-cell">
                    <strong>CPU {{ fmtPercent(row.server.metrics?.cpu?.usagePercent) }}</strong>
                    <small>Mem {{ fmtPercent(row.server.metrics?.memory?.usedPercent) }} · Disk {{ fmtPercent(row.server.metrics?.disk?.usedPercent) }}</small>
                    <small>Load {{ row.server.metrics?.cpu?.load1 ?? "-" }} / {{ row.server.metrics?.cpu?.cores || "-" }} 核</small>
                  </td>
                  <td class="metric-cell">
                    <strong>↓ {{ fmtRate(row.server.metrics?.network?.rxRate || 0) }}</strong>
                    <small>↑ {{ fmtRate(row.server.metrics?.network?.txRate || 0) }}</small>
                    <small>{{ fmtBytes(row.server.metrics?.network?.rx || 0) }} / {{ fmtBytes(row.server.metrics?.network?.tx || 0) }}</small>
                  </td>
                  <td><span :class="`pill status-${row.server.hookStatus || row.server.status || 'unknown'}`">{{ statusLabel(row.server.hookStatus || row.server.status) }}</span></td>
                  <td v-if="editingServerId === row.server.id"><input v-model="serverEditForm.location" class="inline-input short-input" /></td>
                  <td v-else>{{ row.server.location || "-" }}</td>
                  <td v-if="editingServerId === row.server.id">
                    <input v-model.number="serverEditForm.hookPort" class="inline-input short-input" type="number" />
                    <small>{{ row.server.hookUrl || "未安装" }}</small>
                  </td>
                  <td v-else class="metric-cell">
                    <small>{{ fmtTime(row.server.metrics?.updatedAt) }}</small>
                    <small v-if="row.server.metrics?.lastSyncError" class="error-text">{{ row.server.metrics.lastSyncError }}</small>
                    <small v-else>{{ row.server.hookUrl || "未安装" }}</small>
                  </td>
                  <td>
                    <div class="row-actions">
                      <template v-if="editingServerId === row.server.id">
                        <button type="button" title="保存服务器信息" :disabled="busy" @click="saveServer(row.server)"><Save :size="15" /></button>
                        <button type="button" title="取消编辑" :disabled="busy" @click="cancelEditServer"><X :size="15" /></button>
                      </template>
                      <template v-else>
                        <button type="button" title="在线升级 hook" :disabled="busy || (row.server.hookStatus !== 'online' && !row.server.hookSecurity?.legacy)" @click="upgradeHook(row.server)"><ShieldCheck :size="15" /></button>
                        <button type="button" title="信任当前 Hook TLS 证书" :disabled="busy || !row.server.hookSecurity?.mismatch" @click="trustHookCertificate(row.server)"><SearchCheck :size="15" /></button>
                        <button type="button" title="通过 SSH 重装 hook" :disabled="busy" @click="prepareHookUpgrade(row.server)"><RefreshCcw :size="15" /></button>
                        <button type="button" title="编辑服务器信息" :disabled="busy" @click="startEditServer(row.server)"><Pencil :size="15" /></button>
                        <button class="icon-warning" type="button" title="重启服务器" :disabled="busy || row.server.hookStatus !== 'online'" @click="rebootServer(row.server)"><RotateCw :size="15" /></button>
                        <button class="icon-danger" type="button" title="卸载 hook 并删除服务器" :disabled="busy || row.server.hookStatus === 'deleting'" @click="deleteServer(row.server)">
                          <Trash2 :size="15" />
                        </button>
                        <button class="icon-danger" type="button" title="强制清除本地服务器记录" :disabled="busy" @click="forceClearServer(row.server)">
                          <Eraser :size="15" />
                        </button>
                      </template>
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
  name: "ServersPage",
  setup() {
    return useAppBindings();
  }
};
</script>
