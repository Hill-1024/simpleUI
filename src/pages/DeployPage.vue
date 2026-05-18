<script setup>
import { computed } from "vue";
import {
  Rocket,
  X,
  AlertTriangle,
  Sparkles
} from "lucide-vue-next";
import {
  Surface,
  Button,
  TextField,
  Select,
  Textarea,
  Switch,
  Chip
} from "../components/ui";
import { useAppBindings } from "../composables/useAppBindings.js";

const {
  state,
  deployServerId,
  deployProtocol,
  deployNode,
  usersText,
  editingNodeId,
  editingNodeName,
  readyServers,
  currentProvider,
  isHy2,
  isPasswordAuthProtocol,
  hasFixedListenPort,
  busy,
  submitDeployment,
  resetDeployForm
} = useAppBindings();

const acmeEmailVisible = computed(() => {
  return deployProtocol.value === "trojan" || (isHy2.value && ["acme-http", "acme-dns"].includes(deployNode.value.tlsMode));
});

const passwordLabel = computed(() => {
  if (!isPasswordAuthProtocol.value) return "节点账号 username:password";
  return `${deployProtocol.value === "trojan" ? "Trojan" : "HY2"} 节点密码`;
});

const passwordPlaceholder = computed(() =>
  isPasswordAuthProtocol.value
    ? "strong-password (或 name:strong-password,部署使用密码部分)"
    : "alice:strong-password"
);
</script>

<template>
  <div class="flex flex-col gap-5">
    <Surface variant="panel" radius="2xl" padding="lg">
      <header class="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div class="flex items-center gap-2">
          <Rocket :size="18" class="text-primary" />
          <h2 class="type-title-lg text-onSurface">{{ editingNodeId ? "修改节点参数" : "快速部署节点" }}</h2>
          <Chip v-if="editingNodeId" color="warning" variant="tonal" size="sm">编辑中</Chip>
        </div>
        <Button v-if="editingNodeId" variant="text" size="sm" type="button" @click="resetDeployForm">
          <template #leading>
            <X :size="14" />
          </template>
          取消编辑
        </Button>
      </header>

      <div
        v-if="editingNodeId"
        class="flex items-start gap-2 px-4 py-3 rounded-2xl bg-warningContainer text-onWarningContainer mb-5"
      >
        <AlertTriangle :size="16" class="shrink-0 mt-0.5" />
        <p class="type-body-sm">
          正在修改 <strong>{{ editingNodeName }}</strong>。保存后会通过目标服务器 hook 重新部署节点;节点密码、DNS Token 和混淆密码不会保存在面板中,需要重新输入。
        </p>
      </div>

      <form class="flex flex-col gap-5" @submit.prevent="submitDeployment">
        <!-- Core fields -->
        <div class="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          <Select v-model="deployServerId" label="目标服务器" :disabled="!!editingNodeId" required>
            <option value="" disabled>选择 hook 已就绪的服务器</option>
            <option v-for="server in readyServers" :key="server.id" :value="server.id">
              {{ server.name }}
            </option>
          </Select>
          <Select v-model="deployProtocol" label="协议" :disabled="!!editingNodeId">
            <option v-for="provider in state.providers" :key="provider.id" :value="provider.id">
              {{ provider.name }}
            </option>
          </Select>
          <TextField v-model="deployNode.name" label="节点名" placeholder="自动生成" />
          <TextField v-model="deployNode.group" label="节点分组" placeholder="可选,如 Game / Streaming" />
          <TextField
            v-model="deployNode.domain"
            label="域名 / 连接地址"
            :required="!(isHy2 && deployNode.tlsMode === 'self-signed')"
            :placeholder="isHy2 && deployNode.tlsMode === 'self-signed' ? '留空按 IP 模式自动获取' : ''"
          />
          <TextField
            v-model.number="deployNode.listenPort"
            label="监听端口"
            type="number"
            inputmode="numeric"
            :disabled="hasFixedListenPort"
          />
          <Select
            v-model="deployNode.tlsMode"
            label="证书模式"
            :disabled="deployProtocol === 'trojan'"
          >
            <option
              v-for="mode in currentProvider?.certificateModes || []"
              :key="mode.id"
              :value="mode.id"
            >
              {{ mode.label }}
            </option>
          </Select>
          <TextField
            v-if="acmeEmailVisible"
            v-model="deployNode.acmeEmail"
            label="ACME 邮箱"
            placeholder="admin@example.com"
            type="email"
          />
        </div>

        <!-- ACME DNS extras -->
        <div
          v-if="isHy2 && deployNode.tlsMode === 'acme-dns'"
          class="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
        >
          <Select v-model="deployNode.dnsProvider" label="DNS 提供商">
            <option value="cloudflare">Cloudflare</option>
            <option value="duckdns">Duck DNS</option>
            <option value="gandi">Gandi.net</option>
            <option value="godaddy">Godaddy</option>
            <option value="namedotcom">Name.com</option>
            <option value="vultr">Vultr</option>
          </Select>
          <TextField
            v-model="deployNode.dnsToken"
            label="DNS Token / API Key"
            type="password"
            required
          />
          <TextField
            v-if="deployNode.dnsProvider === 'duckdns'"
            v-model="deployNode.dnsOverrideDomain"
            label="Duck DNS override_domain"
          />
          <template v-if="deployNode.dnsProvider === 'namedotcom'">
            <TextField v-model="deployNode.dnsUser" label="Name.com 用户" />
            <TextField v-model="deployNode.dnsServer" label="Name.com 服务器" />
          </template>
        </div>

        <!-- Self-signed -->
        <div
          v-if="isHy2 && deployNode.tlsMode === 'self-signed'"
          class="grid gap-3 grid-cols-1 sm:grid-cols-3"
        >
          <TextField
            v-model="deployNode.selfSignedDomain"
            label="自签证书域名 / SNI"
            placeholder="bing.com"
            required
          />
          <Select v-model="deployNode.selfSignedIpMode" label="自签连接 IP 模式">
            <option value="ipv4">IPv4</option>
            <option value="ipv6">IPv6</option>
          </Select>
          <TextField
            v-model="deployNode.selfSignedHost"
            label="连接地址覆盖"
            placeholder="留空使用上方地址"
          />
        </div>

        <!-- Manual cert -->
        <div
          v-if="isHy2 && deployNode.tlsMode === 'manual-cert'"
          class="grid gap-3 grid-cols-1 sm:grid-cols-2"
        >
          <TextField
            v-model="deployNode.certPath"
            label="证书路径"
            placeholder="/etc/ssl/fullchain.pem"
            required
          />
          <TextField
            v-model="deployNode.keyPath"
            label="私钥路径"
            placeholder="/etc/ssl/private.key"
            required
          />
        </div>

        <!-- HY2 specific advanced -->
        <template v-if="isHy2">
          <div class="grid gap-3">
            <TextField v-model="deployNode.masqueradeUrl" label="伪装站点" />
          </div>

          <Surface variant="soft" radius="lg" padding="md" class="grid gap-5 md:grid-cols-2">
            <div class="flex flex-col gap-3">
              <p class="type-label-lg text-onSurface uppercase">传输</p>
              <Switch v-model="deployNode.ignoreClientBandwidth" label="Brutal ignoreClientBandwidth" />
              <Switch v-model="deployNode.obfsEnabled" label="Salamander 混淆" />
              <Switch v-model="deployNode.sniffEnabled" label="协议嗅探 Sniff" />
              <TextField
                v-if="deployNode.obfsEnabled"
                v-model="deployNode.obfsPassword"
                label="混淆密码"
                type="password"
                required
              />
            </div>
            <div class="flex flex-col gap-3">
              <p class="type-label-lg text-onSurface uppercase">端口跳跃</p>
              <Switch v-model="deployNode.portHoppingEnabled" label="启用端口跳跃" />
              <div v-if="deployNode.portHoppingEnabled" class="grid gap-3 grid-cols-1 sm:grid-cols-2">
                <TextField
                  v-model="deployNode.jumpPortInterface"
                  label="v4 网络接口"
                  placeholder="eth0"
                  required
                />
                <TextField
                  v-model.number="deployNode.jumpPortStart"
                  label="起始端口"
                  type="number"
                  required
                />
                <TextField
                  v-model.number="deployNode.jumpPortEnd"
                  label="结束端口"
                  type="number"
                  required
                />
                <Switch
                  v-model="deployNode.jumpPortIpv6Enabled"
                  label="启用 IPv6 跳跃"
                />
                <TextField
                  v-if="deployNode.jumpPortIpv6Enabled"
                  v-model="deployNode.jumpPortIpv6Interface"
                  label="v6 网络接口"
                  placeholder="eth0"
                  required
                />
              </div>
            </div>
          </Surface>
        </template>

        <Textarea
          v-model="usersText"
          :label="passwordLabel"
          :placeholder="passwordPlaceholder"
          :rows="4"
          monospace
          required
        />

        <div class="flex flex-col gap-2 type-body-sm text-onSurfaceVariant">
          <p v-if="isPasswordAuthProtocol">
            {{ deployProtocol === "trojan" ? "Trojan" : "HY2" }} 按上游脚本写入 password auth,仅第一行密码用于本次节点鉴权。
          </p>
          <p>部署动作由目标服务器上的持久化 hook 执行,不再需要重新输入 SSH 凭据。</p>
        </div>

        <div class="flex gap-2">
          <Button
            type="submit"
            variant="filled"
            size="md"
            :loading="busy"
            :disabled="!deployServerId || !readyServers.length"
          >
            <template #leading>
              <Sparkles :size="16" />
            </template>
            {{ editingNodeId ? "保存并重新部署节点" : "部署节点" }}
          </Button>
        </div>
      </form>
    </Surface>
  </div>
</template>
