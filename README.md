# SimpleUI Node Console

Vue 3 + Node 的多服务器节点控制台，用于把 `seagullz4/hysteria2` 和 `xyz690/Trojan` 的一键部署能力产品化到 WebUI 与本地 WebView 应用里。

## 能力边界

- Hysteria2 使用上游 Python 维护流：先执行 `phy2.sh` 安装依赖，再下载 `hysteria2.py` 保持入口一致；实际无交互部署由 SimpleUI hook 按上游 CLI 分支写入 `/etc/hysteria/config.yaml`。
- Trojan 学习上游 `trojan_install.sh` 的安装、卸载、修复证书分支，保留域名解析校验、nginx 伪装站、`acme.sh --standalone` 自动申请证书、最新 Trojan release 安装和 systemd 服务配置；加速优化分支不接入。
- WebUI 支持多服务器、多节点、快速部署、状态刷新、服务重启、按远程 IP 聚合的 RX/TX 流量/连接概览，以及对 IPv4/IPv6 连接来源 IP 或 CIDR 的多服务器/多节点一键封禁。
- 服务器第一次添加时通过 SSH 安装持久化 `simpleui-hook.service`；后续部署、状态刷新、服务控制和封禁都通过目标服务器上的 hook agent 执行，不再要求重复输入 SSH 凭据。
- 从服务器列表删除服务器时，后端会先通过目标服务器的 hook agent 清理 SimpleUI 部署过的节点，再卸载 `simpleui-hook.service`、`/opt/simpleui-hook` 和本地登记状态。
- 从节点列表删除节点时，后端会通过目标服务器的 hook agent 卸载该节点对应协议的服务、配置、证书和端口跳跃规则，并保留服务器 hook 以便继续管理其他节点。
- SSH 账号密码只随“添加服务器并安装 hook”请求进入后端执行，不落盘到 `data/state.json`；面板持久化保存的是 hook URL 与访问 token。
- 初始状态为空，不内置演示服务器、演示节点或假连接数据；面板只展示真实部署和 hook 刷新回写的数据。

## 开发运行

```bash
pnpm install
pnpm dev
```

前端默认运行在 `http://127.0.0.1:5173`，后端 API 默认运行在 `http://127.0.0.1:8787`。

## 服务器部署模式

```bash
pnpm install --prod
pnpm build
pnpm start
```

生产模式由 Node/Express 提供 API 和构建后的 Vue 静态文件，默认监听 `127.0.0.1:8787`。可以通过 `SIMPLEUI_PORT=8787` 覆盖端口。

## 本机 WebView 模式

```bash
pnpm install
pnpm desktop
```

打包目录版本：

```bash
pnpm desktop:pack
```

正式分发包：

```bash
pnpm desktop:dist
```

Electron 会在本机进程内启动同一套 Node API，然后加载 Vue 构建产物，适合做 self-contained 管理应用。

## Hook 说明

远端 hook 由首次添加服务器时安装到目标机：

- `/opt/simpleui-hook/agent.py`：Python 标准库 HTTP agent，使用 bearer token 鉴权。
- `/opt/simpleui-hook/hooks/`：实际执行的部署、状态、服务和封禁脚本。
- `/etc/simpleui-hook.env`：hook 端口与 token，权限 `600`。
- `simpleui-hook.service`：systemd 持久化服务，默认监听 `37877`；IPv6 字面量服务器会使用 `[IPv6]` URL，并让 hook agent 绑定 `::`。

源码 hook 位于 `server/hooks/remote/`：

- `hysteria2-deploy.sh`：Hysteria2 Python 上游流 + 上游同款 password auth 配置模板；覆盖 ACME HTTP、ACME DNS 多提供商、自签/手动证书、Brutal、Salamander 混淆、Sniff、端口跳跃和订阅模板下载。
- `trojan-deploy.sh`：Trojan 上游 CLI 行为树的非交互实现，自动校验域名、申请/安装证书、安装 Trojan，并按上游单 password auth 写入 server.conf。
- `status.sh`：读取 systemd、`ss` 连接来源 IP、接口流量与内核 conntrack 字节计数，兼容 IPv4/IPv6 endpoint 解析，并按远程 IP 回写 RX/TX 流量统计。
- `ban.sh`：按 IPv4/IPv6 连接来源 IP 或 CIDR 在远端服务器写防火墙 DROP 规则；这不是 WebUI 访问控制，也不是禁用面板账号。
- `service.sh`：启动、停止、重启节点服务。
- `uninstall.sh`：支持节点级卸载和服务器级卸载；节点级只清理指定协议节点并保留 hook，服务器级会清理全部 SimpleUI 节点并异步卸载 hook agent 自身。

Hysteria2 证书模式包括 ACME HTTP、ACME DNS（Cloudflare、Duck DNS、Gandi.net、Godaddy、Name.com、Vultr）、自签证书和手动证书路径。端口跳跃开启时按上游脚本行为把 v4/v6 跳跃区间重定向到当前 Hysteria2 监听端口，并要求填写 v4 网络接口和起止端口；需要 IPv6 跳跃时可额外填写 v6 接口，hook 会写入 `hysteria-iptables.service` 和 `/etc/hy2config/jump_port_back.sh`，删除服务器时一并清理。Trojan 使用上游同款 `acme.sh` HTTP standalone 证书申请流程，监听端口固定为 `443`，当域名通过 AAAA 指向 VPS 时会用 IPv6 standalone 验证并让 Trojan 监听 `::`，nginx `80` 端口作为 Trojan fallback/伪装站。
