<template>
<div v-if="manualNodeModalOpen" class="modal-backdrop" @click.self="manualNodeModalOpen = false">
        <form class="node-select-modal manual-node-modal" @submit.prevent="submitManualNode">
          <div class="modal-head">
            <div>
              <h2>手动添加监控节点</h2>
              <span>只登记已有节点的监听信息，不执行安装、证书申请或配置写入。</span>
            </div>
            <button type="button" title="关闭" @click="manualNodeModalOpen = false"><X :size="18" /></button>
          </div>
          <div class="manual-node-form">
            <label>
              <span>目标服务器</span>
              <select v-model="manualNodeForm.serverId" required>
                <option value="" disabled>选择 hook 已就绪的服务器</option>
                <option v-for="server in readyServers" :key="server.id" :value="server.id">{{ server.name }}</option>
              </select>
            </label>
            <label>
              <span>协议</span>
              <select v-model="manualNodeForm.protocol" required>
                <option v-for="protocol in monitorProtocolOptions" :key="protocol.id" :value="protocol.id">{{ protocol.name }}</option>
              </select>
            </label>
            <label><span>节点名</span><input v-model="manualNodeForm.name" required placeholder="如 JP VLESS 443" /></label>
            <label><span>节点分组</span><input v-model="manualNodeForm.group" placeholder="可选" /></label>
            <label><span>入口地址</span><input v-model="manualNodeForm.endpoint" placeholder="留空使用服务器主机 + 端口" /></label>
            <label><span>域名 / 连接主机</span><input v-model="manualNodeForm.domain" placeholder="可选" /></label>
            <label><span>监听端口</span><input v-model.number="manualNodeForm.listenPort" type="number" min="1" max="65535" required /></label>
            <label>
              <span>传输</span>
              <select v-model="manualNodeForm.serviceProtocol" required>
                <option value="tcp">TCP</option>
                <option value="udp">UDP</option>
                <option value="tcp,udp">TCP + UDP</option>
              </select>
            </label>
            <label class="span-2"><span>systemd 服务</span><input v-model="manualNodeForm.service" placeholder="如 sing-box.service；留空则只能刷新端口连接" /></label>
          </div>
          <p class="form-note manual-node-note">自动发现会优先读取 sing-box 配置；只有配置路径不标准、节点不是 sing-box 承载，或需要先手工纳入监控时才需要这里。</p>
          <div class="modal-actions">
            <button type="button" class="secondary-button" @click="manualNodeModalOpen = false">取消</button>
            <button type="submit" class="primary-button" :disabled="busy || !manualNodeForm.serverId || !manualNodeForm.name || !manualNodeForm.listenPort">
              <Loader2 v-if="busy" class="spin" :size="16" />
              <Plus v-else :size="16" />
              添加监控
            </button>
          </div>
        </form>
      </div>
</template>

<script>
import { useAppBindings } from "../composables/useAppBindings.js";

export default {
  name: "ManualNodeModal",
  setup() {
    return useAppBindings();
  }
};
</script>
