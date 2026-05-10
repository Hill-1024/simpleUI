<template>
<section id="deploy" class="panel">
        <div class="section-title">
          <div><CloudLightning :size="18" /><h2>{{ editingNodeId ? "修改节点参数" : "快速部署节点" }}</h2></div>
          <button v-if="editingNodeId" class="secondary-button" type="button" @click="resetDeployForm">
            <X :size="15" />
            取消编辑
          </button>
        </div>
        <form class="deploy-panel" @submit.prevent="submitDeployment">
          <p v-if="editingNodeId" class="form-note warning-note">正在修改 {{ editingNodeName }}。保存后会通过目标服务器 hook 重新部署该节点；节点密码、DNS Token 和混淆密码不会保存在面板中，需要重新输入。</p>
          <div class="form-grid">
            <label>
              <span>目标服务器</span>
              <select v-model="deployServerId" :disabled="!!editingNodeId" required>
                <option value="" disabled>选择 hook 已就绪的服务器</option>
                <option v-for="server in readyServers" :key="server.id" :value="server.id">{{ server.name }}</option>
              </select>
            </label>
            <label>
              <span>协议</span>
              <select v-model="deployProtocol" :disabled="!!editingNodeId">
                <option v-for="provider in state.providers" :key="provider.id" :value="provider.id">{{ provider.name }}</option>
              </select>
            </label>
            <label><span>节点名</span><input v-model="deployNode.name" placeholder="自动生成" /></label>
            <label><span>节点分组</span><input v-model="deployNode.group" placeholder="可选，如 Game / Streaming" /></label>
            <label>
              <span>域名 / 连接地址</span>
              <input v-model="deployNode.domain" :required="!(isHy2 && deployNode.tlsMode === 'self-signed')" :placeholder="isHy2 && deployNode.tlsMode === 'self-signed' ? '留空按 IP 模式自动获取' : ''" />
            </label>
            <label>
              <span>监听端口</span>
              <input v-model.number="deployNode.listenPort" type="number" :disabled="hasFixedListenPort" />
            </label>
            <label>
              <span>证书模式</span>
              <select v-model="deployNode.tlsMode" :disabled="deployProtocol === 'trojan'">
                <option v-for="mode in currentProvider?.certificateModes || []" :key="mode.id" :value="mode.id">{{ mode.label }}</option>
              </select>
            </label>
            <label v-if="deployProtocol === 'trojan' || (isHy2 && ['acme-http', 'acme-dns'].includes(deployNode.tlsMode))">
              <span>ACME 邮箱</span>
              <input v-model="deployNode.acmeEmail" placeholder="admin@example.com" />
            </label>
            <label v-if="isHy2 && deployNode.tlsMode === 'acme-dns'">
              <span>DNS 提供商</span>
              <select v-model="deployNode.dnsProvider">
                <option value="cloudflare">Cloudflare</option>
                <option value="duckdns">Duck DNS</option>
                <option value="gandi">Gandi.net</option>
                <option value="godaddy">Godaddy</option>
                <option value="namedotcom">Name.com</option>
                <option value="vultr">Vultr</option>
              </select>
            </label>
            <label v-if="isHy2 && deployNode.tlsMode === 'acme-dns'">
              <span>DNS Token / API Key</span>
              <input v-model="deployNode.dnsToken" type="password" required />
            </label>
            <label v-if="isHy2 && deployNode.tlsMode === 'acme-dns' && deployNode.dnsProvider === 'duckdns'">
              <span>Duck DNS override_domain</span>
              <input v-model="deployNode.dnsOverrideDomain" />
            </label>
            <template v-if="isHy2 && deployNode.tlsMode === 'acme-dns' && deployNode.dnsProvider === 'namedotcom'">
              <label><span>Name.com 用户</span><input v-model="deployNode.dnsUser" /></label>
              <label><span>Name.com 服务器</span><input v-model="deployNode.dnsServer" /></label>
            </template>
            <template v-if="isHy2 && deployNode.tlsMode === 'self-signed'">
              <label><span>自签证书域名/SNI</span><input v-model="deployNode.selfSignedDomain" placeholder="bing.com" required /></label>
              <label>
                <span>自签连接 IP 模式</span>
                <select v-model="deployNode.selfSignedIpMode">
                  <option value="ipv4">IPv4</option>
                  <option value="ipv6">IPv6</option>
                </select>
              </label>
              <label><span>连接地址覆盖</span><input v-model="deployNode.selfSignedHost" placeholder="留空使用上方地址" /></label>
            </template>
            <template v-if="isHy2 && deployNode.tlsMode === 'manual-cert'">
              <label class="span-2"><span>证书路径</span><input v-model="deployNode.certPath" placeholder="/etc/ssl/fullchain.pem" required /></label>
              <label><span>私钥路径</span><input v-model="deployNode.keyPath" placeholder="/etc/ssl/private.key" required /></label>
            </template>
            <template v-if="isHy2">
              <label><span>伪装站点</span><input v-model="deployNode.masqueradeUrl" /></label>
              <div class="span-3 hy2-options">
                <div class="option-group">
                  <div class="option-heading">传输</div>
                  <div class="toggle-stack">
                    <label class="toggle-row">
                      <input v-model="deployNode.ignoreClientBandwidth" type="checkbox" />
                      <span>Brutal ignoreClientBandwidth</span>
                    </label>
                    <label class="toggle-row">
                      <input v-model="deployNode.obfsEnabled" type="checkbox" />
                      <span>Salamander 混淆</span>
                    </label>
                    <label class="toggle-row">
                      <input v-model="deployNode.sniffEnabled" type="checkbox" />
                      <span>协议嗅探 Sniff</span>
                    </label>
                  </div>
                  <label v-if="deployNode.obfsEnabled" class="compact-field">
                    <span>混淆密码</span>
                    <input v-model="deployNode.obfsPassword" type="password" required />
                  </label>
                </div>

                <div class="option-group port-hop-group">
                  <div class="option-heading">端口跳跃</div>
                  <label class="toggle-row toggle-row-primary">
                    <input v-model="deployNode.portHoppingEnabled" type="checkbox" />
                    <span>启用端口跳跃</span>
                  </label>
                  <div v-if="deployNode.portHoppingEnabled" class="port-hop-fields">
                    <label><span>v4 网络接口</span><input v-model="deployNode.jumpPortInterface" placeholder="eth0" required /></label>
                    <label><span>起始端口</span><input v-model.number="deployNode.jumpPortStart" type="number" required /></label>
                    <label><span>结束端口</span><input v-model.number="deployNode.jumpPortEnd" type="number" required /></label>
                    <label class="toggle-row ipv6-toggle">
                      <input v-model="deployNode.jumpPortIpv6Enabled" type="checkbox" />
                      <span>启用 IPv6 跳跃</span>
                    </label>
                    <label v-if="deployNode.jumpPortIpv6Enabled"><span>v6 网络接口</span><input v-model="deployNode.jumpPortIpv6Interface" placeholder="eth0" required /></label>
                  </div>
                </div>
              </div>
            </template>
            <label class="span-2">
              <span>{{ isPasswordAuthProtocol ? `${deployProtocol === "trojan" ? "Trojan" : "HY2"} 节点密码` : "节点账号 username:password" }}</span>
              <textarea v-model="usersText" rows="4" :placeholder="isPasswordAuthProtocol ? 'strong-password（或 name:strong-password，部署使用密码部分）' : 'alice:strong-password'" required />
            </label>
          </div>
          <p v-if="isPasswordAuthProtocol" class="form-note">{{ deployProtocol === "trojan" ? "Trojan" : "HY2" }} 按上游脚本写入 password auth，仅第一行密码用于本次节点鉴权。</p>
          <p class="form-note">部署动作由目标服务器上的持久化 hook 执行，不再需要重新输入 SSH 凭据。</p>
          <button class="primary-button" type="submit" :disabled="busy || !deployServerId || !readyServers.length">
            <Loader2 v-if="busy" class="spin" :size="16" />
            <CloudLightning v-else :size="16" />
            {{ editingNodeId ? "保存并重新部署节点" : "部署节点" }}
          </button>
        </form>
      </section>
</template>

<script>
import { useAppBindings } from "../composables/useAppBindings.js";

export default {
  name: "DeployPage",
  setup() {
    return useAppBindings();
  }
};
</script>
