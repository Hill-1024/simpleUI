<script setup>
import { Plus } from "lucide-vue-next";
import {
  Modal,
  Button,
  TextField,
  Select
} from "./ui";
import { useAppBindings } from "../composables/useAppBindings.js";

const {
  manualNodeModalOpen,
  manualNodeForm,
  readyServers,
  monitorProtocolOptions,
  busy,
  submitManualNode
} = useAppBindings();

function close() {
  manualNodeModalOpen.value = false;
}
</script>

<template>
  <Modal
    :open="manualNodeModalOpen"
    size="lg"
    title="手动添加监控节点"
    subtitle="只登记已有节点的监听信息,不执行安装、证书申请或配置写入。"
    @close="close"
  >
    <form id="manual-node-form" class="flex flex-col gap-3" @submit.prevent="submitManualNode">
      <div class="grid gap-3 grid-cols-1 sm:grid-cols-2">
        <Select v-model="manualNodeForm.serverId" label="目标服务器" required>
          <option value="" disabled>选择 hook 已就绪的服务器</option>
          <option v-for="server in readyServers" :key="server.id" :value="server.id">
            {{ server.name }}
          </option>
        </Select>
        <Select v-model="manualNodeForm.protocol" label="协议" required>
          <option v-for="protocol in monitorProtocolOptions" :key="protocol.id" :value="protocol.id">
            {{ protocol.name }}
          </option>
        </Select>
        <TextField v-model="manualNodeForm.name" label="节点名" placeholder="如 JP VLESS 443" required />
        <TextField v-model="manualNodeForm.group" label="节点分组" placeholder="可选" />
        <TextField
          v-model="manualNodeForm.endpoint"
          label="入口地址"
          placeholder="留空使用服务器主机 + 端口"
        />
        <TextField v-model="manualNodeForm.domain" label="域名 / 连接主机" placeholder="可选" />
        <TextField
          v-model.number="manualNodeForm.listenPort"
          label="监听端口"
          type="number"
          :min="1"
          :max="65535"
          required
        />
        <Select v-model="manualNodeForm.serviceProtocol" label="传输" required>
          <option value="tcp">TCP</option>
          <option value="udp">UDP</option>
          <option value="tcp,udp">TCP + UDP</option>
        </Select>
      </div>
      <TextField
        v-model="manualNodeForm.service"
        label="systemd 服务"
        placeholder="如 sing-box.service;留空则只能刷新端口连接"
      />
      <p class="type-body-sm text-onSurfaceVariant">
        自动发现会优先读取 sing-box 配置;只有配置路径不标准、节点不是 sing-box 承载,或需要先手工纳入监控时才需要这里。
      </p>
    </form>

    <template #footer>
      <Button variant="text" type="button" @click="close">取消</Button>
      <Button
        variant="filled"
        type="submit"
        form="manual-node-form"
        :loading="busy"
        :disabled="!manualNodeForm.serverId || !manualNodeForm.name || !manualNodeForm.listenPort"
      >
        <template #leading>
          <Plus :size="15" />
        </template>
        添加监控
      </Button>
    </template>
  </Modal>
</template>
