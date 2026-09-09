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
  sharedCertificatePeer,
  effectiveTlsMode,
  isHy2,
  isPasswordAuthProtocol,
  hasFixedListenPort,
  busy,
  submitDeployment,
  resetDeployForm
} = useAppBindings();

const acmeEmailVisible = computed(() => {
  return ["acme-http", "acme-dns"].includes(effectiveTlsMode.value);
});

const passwordLabel = computed(() => {
  if (!isPasswordAuthProtocol.value) return "节点账号";
  return `${deployProtocol.value === "trojan" ? "Trojan" : "HY2"} 节点密码`;
});

const passwordPlaceholder = computed(() =>
  isPasswordAuthProtocol.value
    ? "输入节点密码"
    : "alice:strong-password"
);
</script>

<template>
  <div class="flex flex-col gap-6">
    <Surface v-reveal variant="panel" radius="2xl" padding="lg">
      <header class="flex items-center justify-between gap-3 mb-5 flex-wrap">
        <div class="flex items-center gap-2.5">
          <span class="grid place-items-center h-8 w-8 rounded-[10px] bg-primary/10 text-primary">
            <Rocket :size="15" />
          </span>
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
        class="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-warningContainer text-onWarningContainer mb-6"
      >
        <AlertTriangle :size="15" class="shrink-0 mt-0.5" />
        <p class="type-body-sm">
          保存后将重新部署 <strong>{{ editingNodeName }}</strong>。请重新填写节点密码，以及所需的 DNS Token 和混淆密码。
        </p>
      </div>

      <form class="flex flex-col gap-8" @submit.prevent="submitDeployment">
        <!-- Basics -->
        <section class="flex flex-col gap-4">
          <p class="type-eyebrow text-onSurfaceVariant/85">基础配置</p>
          <div class="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            <Select v-model="deployServerId" label="目标服务器" :disabled="!!editingNodeId" required>
              <option value="" disabled>选择服务器</option>
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
              :required="!(isHy2 && effectiveTlsMode === 'self-signed')"
              :placeholder="isHy2 && effectiveTlsMode === 'self-signed' ? '留空按 IP 模式自动获取' : ''"
            />
            <TextField
              v-model.number="deployNode.listenPort"
              label="监听端口"
              type="number"
              inputmode="numeric"
              :disabled="hasFixedListenPort"
            />
          </div>
        </section>

        <!-- Certificate -->
        <section class="flex flex-col gap-4">
          <p class="type-eyebrow text-onSurfaceVariant/85">证书</p>
          <div class="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            <Select
              :model-value="effectiveTlsMode"
              @update:model-value="deployNode.tlsMode = $event"
              label="证书模式"
              :disabled="!!sharedCertificatePeer"
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
          <p v-if="sharedCertificatePeer" class="type-body-sm text-onSurfaceVariant" role="status">
            与本机 {{ sharedCertificatePeer.protocol === 'trojan' ? 'Trojan' : 'HY2' }} 节点共用证书。
          </p>

          <!-- ACME DNS extras -->
          <div
            v-if="isHy2 && effectiveTlsMode === 'acme-dns'"
            class="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
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
              :helper="deployNode.dnsProvider === 'godaddy' ? '格式：API_KEY:API_SECRET' : ''"
              type="password"
              required
            />
            <TextField
              v-if="deployNode.dnsProvider === 'duckdns'"
              v-model="deployNode.dnsOverrideDomain"
              label="Duck DNS 验证域名"
            />
            <template v-if="deployNode.dnsProvider === 'namedotcom'">
              <TextField v-model="deployNode.dnsUser" label="Name.com 用户" />
              <TextField v-model="deployNode.dnsServer" label="Name.com 服务器" />
            </template>
          </div>

          <!-- Self-signed -->
          <div
            v-if="isHy2 && effectiveTlsMode === 'self-signed'"
            class="grid gap-4 grid-cols-1 sm:grid-cols-3"
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
              label="指定连接地址"
              placeholder="留空使用上方地址"
            />
          </div>

          <!-- Manual cert -->
          <div
            v-if="effectiveTlsMode === 'manual-cert'"
            class="grid gap-4 grid-cols-1 sm:grid-cols-2"
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
        </section>

        <!-- HY2 transport -->
        <template v-if="isHy2">
          <section class="flex flex-col gap-4">
            <p class="type-eyebrow text-onSurfaceVariant/85">传输与混淆</p>
            <div class="grid gap-4">
              <TextField v-model="deployNode.masqueradeUrl" label="伪装站点" />
            </div>
            <Surface variant="soft" radius="lg" padding="md" class="grid gap-6 md:grid-cols-2">
              <div class="flex flex-col gap-3.5">
                <p class="type-label-lg text-onSurface">传输选项</p>
                <Switch v-model="deployNode.ignoreClientBandwidth" label="忽略客户端带宽设置" />
                <Switch v-model="deployNode.obfsEnabled" label="Salamander 混淆" />
                <Switch v-model="deployNode.sniffEnabled" label="协议嗅探" />
                <TextField
                  v-if="deployNode.obfsEnabled"
                  v-model="deployNode.obfsPassword"
                  label="混淆密码"
                  type="password"
                  required
                />
              </div>
              <div class="flex flex-col gap-3.5">
                <p class="type-label-lg text-onSurface">端口跳跃</p>
                <Switch v-model="deployNode.portHoppingEnabled" label="启用端口跳跃" />
                <div v-if="deployNode.portHoppingEnabled" class="grid gap-4 grid-cols-1 sm:grid-cols-2">
                  <TextField
                    v-model="deployNode.jumpPortInterface"
                    label="IPv4 网络接口"
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
                    label="IPv6 网络接口"
                    placeholder="eth0"
                    required
                  />
                </div>
              </div>
            </Surface>
          </section>
        </template>

        <!-- Accounts -->
        <section class="flex flex-col gap-4">
          <p class="type-eyebrow text-onSurfaceVariant/85">访问账号</p>
          <Textarea
            v-model="usersText"
            :label="passwordLabel"
            :placeholder="passwordPlaceholder"
            :helper="isPasswordAuthProtocol ? '使用第一行密码。' : '每行一个账号，格式为 username:password。'"
            :rows="4"
            monospace
            required
          />
        </section>

        <div class="flex items-center gap-3 pt-1">
          <Button
            type="submit"
            variant="filled"
            size="lg"
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
