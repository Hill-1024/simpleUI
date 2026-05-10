<p align="center">
  <img src="./build/icon.png" alt="SimpleUI icon" width="96" />
</p>

# SimpleUI Node Console

[中文](./README.md) | English | [日本語](./README.ja.md)

[**Demo** ](https://simpleui-32n.pages.dev/#overview)

SimpleUI is a lightweight WebUI for operating proxy nodes across multiple servers. It brings server onboarding, Hysteria2/Trojan deployment, node status synchronization, client IP blocking, remote tools, terminal access, and hook upgrades into one control plane so a personal operator or small team can manage distributed nodes with a clear and auditable workflow.

The project is built with a Vue 3 frontend, a Node.js/Express control plane, a remote hook agent, and an optional Electron WebView shell. The WebUI coordinates and visualizes operations, while node configuration, service state, and diagnostics remain on the managed servers.

## Best Fit

- Managing multiple proxy servers from one administration host.
- Deploying and maintaining Hysteria2 or Trojan nodes through a WebUI.
- Viewing remote service state, blocking client IPs, running diagnostic tools, or opening a remote terminal from the panel.
- Keeping local development login-free while production deployments are protected by default.

## Features

- **Server onboarding**: installs a persistent hook through SSH on first connection, then uses the hook channel for routine operations.
- **One-click deployment**: supports Hysteria2 and Trojan with certificate mode, port, password, and service options.
- **Node discovery**: can monitor existing sing-box nodes, including Shadowsocks, VMess, VLESS, Naive, Hysteria, ShadowTLS, TUIC, AnyTLS, WireGuard, SOCKS, HTTP, and Mixed.
- **Remote operations**: service restart, status refresh, client IP blocking, tool execution, online hook upgrade, and remote terminal.
- **Secure defaults**: production mode requires login by default and generates a random UUID bootstrap password on first start; development mode remains login-free.
- **Desktop mode**: can run inside an Electron WebView and build desktop packages.

## Architecture

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

Important directories:

| Path | Purpose |
| --- | --- |
| `src/` | Vue 3 frontend |
| `server/` | Express API, auth, job stream, SSH, and hook orchestration |
| `server/lib/hook-agent.js` | Core remote hook agent logic |
| `scripts/install-webui.sh` | WebUI install, update, and uninstall script |
| `desktop/` | Electron desktop shell |
| `data/` | Local state plus demo/archive data |

## Install WebUI

Install the WebUI on a management server and access it through a reverse proxy, VPN, or SSH tunnel. By default it listens only on `127.0.0.1:8787`.

```bash
curl -fsSL https://raw.githubusercontent.com/Hill-1024/simpleUI/main/scripts/install-webui.sh | sudo env SIMPLEUI_HOST=127.0.0.1 SIMPLEUI_PORT=8787 bash
```

If you intentionally want to listen on all interfaces:

```bash
curl -fsSL https://raw.githubusercontent.com/Hill-1024/simpleUI/main/scripts/install-webui.sh | sudo env SIMPLEUI_HOST=0.0.0.0 SIMPLEUI_PORT=8787 bash
```

Open the panel after installation:

```text
http://server-address:8787
```

The first start generates an initial WebUI password. The installer tries to print it directly; if it is not visible, inspect the service log:

```bash
sudo journalctl -u simpleui-web.service --no-pager
```

## Update and Uninstall

Run the install command again to update to the latest version on the selected branch:

```bash
curl -fsSL https://raw.githubusercontent.com/Hill-1024/simpleUI/main/scripts/install-webui.sh | sudo env SIMPLEUI_HOST=127.0.0.1 SIMPLEUI_PORT=8787 bash
```

Customize directory, branch, or port:

```bash
curl -fsSL https://raw.githubusercontent.com/Hill-1024/simpleUI/main/scripts/install-webui.sh | sudo env \
  SIMPLEUI_APP_DIR=/opt/simpleui \
  SIMPLEUI_BRANCH=main \
  SIMPLEUI_HOST=127.0.0.1 \
  SIMPLEUI_PORT=8787 \
  bash
```

Uninstall the service, application directory, and default runtime user:

```bash
curl -fsSL https://raw.githubusercontent.com/Hill-1024/simpleUI/main/scripts/install-webui.sh | sudo bash -s -- uninstall
```

Keep the `/opt/simpleui` data directory:

```bash
curl -fsSL https://raw.githubusercontent.com/Hill-1024/simpleUI/main/scripts/install-webui.sh | sudo env SIMPLEUI_KEEP_DATA=1 bash -s -- uninstall
```

## Workflow

1. Log in to the WebUI and change the initial password from the About page.
2. Add a server from the Servers page with SSH host, port, user, and password, then wait for the hook installation to finish.
3. Deploy Hysteria2 or Trojan from the Deploy page on an online hooked server.
4. Existing sing-box nodes can be discovered automatically; non-standard configurations can be added manually from the Nodes page.
5. Use Overview, Nodes, IP Blocking, Tools, and Terminal pages to inspect state and run maintenance operations.
6. Online hooks can be upgraded from the Servers page. SSH reinstall is only needed for first onboarding, offline hooks, or old hooks without online upgrade support.

## Local Development

```bash
pnpm install
pnpm dev
```

The frontend runs at `http://127.0.0.1:5173`, and the API runs at `http://127.0.0.1:8787` by default.

Development mode is intended for local iteration and does not show the login page. Production mode enables authentication by default:

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm start
```

Common scripts:

| Command | Description |
| --- | --- |
| `pnpm dev` | Start frontend and API development services |
| `pnpm dev:web` | Start the Vite frontend only |
| `pnpm dev:api` | Start the Express API only |
| `pnpm build` | Build the Web frontend |
| `pnpm start` | Start the control plane in production mode |
| `pnpm check` | Run project checks |
| `pnpm desktop` | Start Electron desktop mode |
| `pnpm desktop:dist` | Build desktop release packages |

## Operations

```bash
sudo systemctl status simpleui-web
sudo systemctl restart simpleui-web
sudo journalctl -u simpleui-web -f
```

## Release Artifacts

GitHub Releases build and upload:

| Platform | Artifacts |
| --- | --- |
| Windows x64 | `exe` / `zip` |
| macOS arm64 | `dmg` / `zip` |
| Linux x64 | `deb` / `zip` |

## Security Notes

- Production installs listen on `127.0.0.1` by default. Use a reverse proxy, TLS, access control, or VPN before exposing the panel.
- The initial password is only for bootstrap. Change it after deployment.
- Persistent hooks use self-signed HTTPS with certificate fingerprint pinning; still expose hook ports only through a firewall, VPN, or SSH tunnel.
- Remote server credentials should only be used in trusted environments. Once hooks are online, routine maintenance should avoid repeated SSH credential entry.
- The panel includes remote command and terminal capabilities; do not expose a production instance to an untrusted network.

## Credits

SimpleUI's deployment and diagnostics flow is informed by these projects and ecosystems:

- [Hysteria](https://github.com/apernet/hysteria)
- [seagullz4/hysteria2](https://github.com/seagullz4/hysteria2)
- [trojan-gfw/trojan](https://github.com/trojan-gfw/trojan)
- [xyz690/Trojan](https://github.com/xyz690/Trojan)
- [SagerNet/sing-box](https://github.com/SagerNet/sing-box)
- [xykt/IPQuality](https://github.com/xykt/IPQuality)
- [ylx2016/Linux-NetSpeed](https://github.com/ylx2016/Linux-NetSpeed)

## License

This repository does not declare an open-source license yet. Please contact the maintainer before reuse, redistribution, or commercial use.
