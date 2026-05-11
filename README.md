<p align="center">
  <img src="./build/icon.png" alt="SimpleUI icon" width="96" />
</p>

# SimpleUI Node Console

中文 | [English](./README.en.md) | [日本語](./README.ja.md)

[**Demo** ](https://simpleui-32n.pages.dev/#overview)

SimpleUI 是一个面向多服务器代理节点运维的轻量 WebUI。它把服务器接入、Hysteria2/Trojan 部署、节点状态同步、客户端封禁、远程工具执行、终端维护和 hook 升级放在同一套控制面板里，目标是让个人或小团队可以用清晰、可审计的流程管理分散在不同机器上的节点。

项目由 Vue 3 前端、Node.js/Express 控制面、远程 hook agent 和可选 Electron WebView 组成。WebUI 只负责调度和可视化，真正的节点配置、服务状态和诊断动作发生在被管理服务器上。

## 适合场景

- 一台管理服务器统一维护多台代理节点。
- 希望通过 WebUI 部署和维护 Hysteria2、Trojan 节点。
- 需要在面板中查看远端状态、封禁客户端 IP、执行诊断工具或打开远程终端。
- 希望本地开发时保持无登录摩擦，但生产部署默认具备登录保护。

## 核心能力

- **服务器接入**: 首次通过 SSH 安装持久化 hook，之后优先走 hook 通道执行维护任务。
- **一键部署**: 支持 Hysteria2 与 Trojan，包含证书模式、端口、密码和服务参数配置。
- **节点同步**: 可识别并纳入已有 sing-box 主流协议节点，包括 Shadowsocks、VMess、VLESS、Naive、Hysteria、ShadowTLS、TUIC、AnyTLS、WireGuard、SOCKS、HTTP 和 Mixed。
- **远程维护**: 支持服务重启、状态刷新、客户端 IP 封禁、工具运行、在线升级 hook 和远程终端。
- **安全默认值**: 生产模式默认需要登录，首次启动生成随机 UUID 初始密码；开发模式保持免登录。
- **桌面模式**: 可通过 Electron 以桌面 WebView 方式运行，也可以构建桌面安装包。

## 架构概览

```text
Vue 3 Web UI
    |
    | HTTP API / job stream
    v
Node.js control plane
    |
    | SSH bootstrap / hook protocol
    v
Remote hook agent
    |
    | systemd / provider scripts / node configs
    v
Managed proxy services
```

关键目录：

| 路径 | 说明 |
| --- | --- |
| `src/` | Vue 3 前端界面 |
| `server/` | Express API、认证、任务流、SSH 和 hook 调度 |
| `server/lib/hook-agent.js` | 远程 hook agent 的核心逻辑 |
| `scripts/install-webui.sh` | WebUI 服务器安装、更新和卸载脚本 |
| `desktop/` | Electron 桌面壳 |
| `data/` | 本地状态和演示/归档数据 |

## 安装 WebUI

推荐把 WebUI 安装到一台管理服务器，再通过反向代理、VPN 或 SSH tunnel 访问。默认只监听本机 `127.0.0.1:8787`。

```bash
curl -fsSL https://raw.githubusercontent.com/Hill-1024/simpleUI/main/scripts/install-webui.sh | sudo env SIMPLEUI_HOST=127.0.0.1 SIMPLEUI_PORT=8787 bash
```

如果你明确希望直接对外监听：

```bash
curl -fsSL https://raw.githubusercontent.com/Hill-1024/simpleUI/main/scripts/install-webui.sh | sudo env SIMPLEUI_HOST=0.0.0.0 SIMPLEUI_PORT=8787 bash
```

安装完成后访问：

```text
http://服务器地址:8787
```

首次启动会生成 WebUI 初始密码。安装脚本会尽量直接打印；如果没有看到，可以查看 systemd 日志：

```bash
sudo journalctl -u simpleui-web.service --no-pager
```

## 更新与卸载

再次运行安装命令即可更新到指定分支的最新版本：

```bash
curl -fsSL https://raw.githubusercontent.com/Hill-1024/simpleUI/main/scripts/install-webui.sh | sudo env SIMPLEUI_HOST=127.0.0.1 SIMPLEUI_PORT=8787 bash
```

自定义安装目录、分支或端口：

```bash
curl -fsSL https://raw.githubusercontent.com/Hill-1024/simpleUI/main/scripts/install-webui.sh | sudo env \
  SIMPLEUI_APP_DIR=/opt/simpleui \
  SIMPLEUI_BRANCH=main \
  SIMPLEUI_HOST=127.0.0.1 \
  SIMPLEUI_PORT=8787 \
  bash
```

卸载服务、应用目录和默认运行用户：

```bash
curl -fsSL https://raw.githubusercontent.com/Hill-1024/simpleUI/main/scripts/install-webui.sh | sudo bash -s -- uninstall
```

保留 `/opt/simpleui` 数据目录：

```bash
curl -fsSL https://raw.githubusercontent.com/Hill-1024/simpleUI/main/scripts/install-webui.sh | sudo env SIMPLEUI_KEEP_DATA=1 bash -s -- uninstall
```

## 使用流程

1. 登录 WebUI，并在“关于”页修改初始密码。
2. 在“服务器”页添加 SSH 主机、端口、用户和密码，等待 hook 安装完成。
3. 在“部署”页选择在线服务器，部署 Hysteria2 或 Trojan 节点。
4. 如果服务器已有 sing-box 节点，等待同步自动识别；配置不标准时，可在“节点”页手动添加监控。
5. 在“概览”“节点”“连接封禁”“工具”“终端”页面查看状态、操作服务或执行维护命令。
6. hook 在线时可直接在“服务器”页升级；只有首次接入、hook 离线或旧 hook 不支持升级时，才需要 SSH 重装。

## 本地开发

```bash
pnpm install
pnpm dev
```

前端默认运行在 `http://127.0.0.1:5173`，后端 API 默认运行在 `http://127.0.0.1:8787`。

开发模式用于本机调试，默认不弹登录页。生产模式默认启用认证：

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm start
```

常用脚本：

| 命令 | 说明 |
| --- | --- |
| `pnpm dev` | 同时启动前端和 API 开发服务 |
| `pnpm dev:web` | 仅启动 Vite 前端 |
| `pnpm dev:api` | 仅启动 Express API |
| `pnpm build` | 构建 Web 前端 |
| `pnpm start` | 以生产模式启动控制面 |
| `pnpm check` | 运行项目检查 |
| `pnpm desktop` | 启动 Electron 桌面模式 |
| `pnpm desktop:dist` | 构建桌面发行包 |

## 运维命令

```bash
sudo systemctl status simpleui-web
sudo systemctl restart simpleui-web
sudo journalctl -u simpleui-web -f
```

## Release 包

GitHub Release 会构建并上传：

| 平台 | 产物 |
| --- | --- |
| Windows x64 | `exe` / `zip` |
| macOS arm64 | `dmg` / `zip` |
| Linux x64 | `deb` / `zip` |

## 安全说明

- 默认生产监听地址是 `127.0.0.1`，公开暴露前建议先接入反向代理、TLS、访问控制或 VPN。
- 初始密码只用于首次登录，部署后应立即修改。
- 持久化 Hook 使用自签 HTTPS 和证书指纹固定；仍建议只通过防火墙、VPN 或 SSH tunnel 暴露 Hook 端口。
- 远程服务器凭据只应在可信环境中使用；hook 在线后，日常维护应尽量减少重复 SSH 明文凭据输入。
- 面板具备远程命令和终端能力，请不要把生产实例暴露给不可信网络。

## 上游与致谢

SimpleUI 的部署流程和诊断能力参考了这些项目和生态：

- [Hysteria](https://github.com/apernet/hysteria)
- [seagullz4/hysteria2](https://github.com/seagullz4/hysteria2)
- [trojan-gfw/trojan](https://github.com/trojan-gfw/trojan)
- [xyz690/Trojan](https://github.com/xyz690/Trojan)
- [SagerNet/sing-box](https://github.com/SagerNet/sing-box)
- [xykt/IPQuality](https://github.com/xykt/IPQuality)
- [ylx2016/Linux-NetSpeed](https://github.com/ylx2016/Linux-NetSpeed)

## 许可证

本项目源代码根据 GNU Affero General Public License v3.0（AGPL-3.0）开源，详见 [LICENSE](./LICENSE)。复用、修改、分发或以网络服务形式对外提供本项目时，请遵守 AGPL-3.0；第三方服务、远端节点配置和用户数据不因本仓库许可证自动获得授权。
