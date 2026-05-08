# SimpleUI Node Console

SimpleUI 是一个用于管理多台服务器代理节点的 WebUI。它通过首次 SSH 安装一个持久化 hook，之后部署节点、刷新状态、重启服务、封禁客户端 IP、运行服务器工具和在线升级 hook 都可以直接在面板里完成。

当前一键部署支持 Hysteria2 和 Trojan；节点监控还可以纳入已有 sing-box 主流协议节点，包括 Shadowsocks、VMess、VLESS、Naive、Hysteria、ShadowTLS、TUIC、AnyTLS、WireGuard、SOCKS、HTTP 和 Mixed。

## 安装 WebUI

推荐把 WebUI 安装到一台管理服务器上，再通过反向代理、VPN 或 SSH tunnel 访问。默认只监听本机 `127.0.0.1:8787`。

```bash
curl -fsSL https://raw.githubusercontent.com/Hill-1024/simpleUI/main/scripts/install-webui.sh | sudo env SIMPLEUI_HOST=127.0.0.1 SIMPLEUI_PORT=8787 bash
```

如果你明确希望直接对外监听：

```bash
curl -fsSL https://raw.githubusercontent.com/Hill-1024/simpleUI/main/scripts/install-webui.sh | sudo env SIMPLEUI_HOST=0.0.0.0 SIMPLEUI_PORT=8787 bash
```

安装完成后打开：

```text
http://服务器地址:8787
```

首次启动会生成 WebUI 初始密码。安装脚本会尽量直接打印；如果没有看到，可以查看日志：

```bash
sudo journalctl -u simpleui-web.service --no-pager
```

## 更新 WebUI

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

## 卸载 WebUI

卸载服务、应用目录和默认运行用户：

```bash
curl -fsSL https://raw.githubusercontent.com/Hill-1024/simpleUI/main/scripts/install-webui.sh | sudo bash -s -- uninstall
```

保留 `/opt/simpleui` 数据目录：

```bash
curl -fsSL https://raw.githubusercontent.com/Hill-1024/simpleUI/main/scripts/install-webui.sh | sudo env SIMPLEUI_KEEP_DATA=1 bash -s -- uninstall
```

## 常用服务命令

```bash
sudo systemctl status simpleui-web
sudo systemctl restart simpleui-web
sudo journalctl -u simpleui-web -f
```

## 使用流程

1. 登录 WebUI，并在“关于”页修改初始密码。
2. 进入“服务器”页，填写 SSH 主机、端口、用户和密码，添加服务器并等待 hook 安装完成。
3. 进入“部署”页，在 hook 在线的服务器上部署 Hysteria2 或 Trojan 节点。
4. 如果服务器已有 sing-box 节点，等待同步自动识别；配置不标准时，可以在“节点”页手动添加监控。
5. 在“概览”“节点”“连接封禁”“工具”“终端”页面查看状态、操作服务、封禁客户端 IP 或执行维护命令。
6. 已在线的 hook 可以在“服务器”页直接在线升级；只有首次接入、hook 离线或旧 hook 不支持在线升级时，才需要通过 SSH 重装。

## 本地开发

```bash
pnpm install
pnpm dev
```

前端默认运行在 `http://127.0.0.1:5173`，后端 API 默认运行在 `http://127.0.0.1:8787`。

生产模式本地启动：

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm start
```

桌面 WebView 模式：

```bash
pnpm desktop
```

打包：

```bash
pnpm desktop:dist
```

## Release 包

GitHub Release 会构建并上传：

- Windows x64: `exe` / `zip`
- macOS arm64: `dmg` / `zip`
- Linux x64: `deb` / `zip`

## 致谢

SimpleUI 的实现学习并参考了这些上游项目和生态：

- [Hysteria](https://github.com/apernet/hysteria)
- [seagullz4/hysteria2](https://github.com/seagullz4/hysteria2)
- [trojan-gfw/trojan](https://github.com/trojan-gfw/trojan)
- [xyz690/Trojan](https://github.com/xyz690/Trojan)
- [SagerNet/sing-box](https://github.com/SagerNet/sing-box)
- [xykt/IPQuality](https://github.com/xykt/IPQuality)
- [ylx2016/Linux-NetSpeed](https://github.com/ylx2016/Linux-NetSpeed)

感谢这些项目提供的协议实现、运维脚本思路和诊断工具。
