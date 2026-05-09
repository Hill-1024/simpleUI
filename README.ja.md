<p align="center">
  <img src="./build/icon.png" alt="SimpleUI icon" width="96" />
</p>

# SimpleUI Node Console

[中文](./README.md) | [English](./README.en.md) | 日本語

**Demo:** デプロイ完了後に追記します。

SimpleUI は、複数サーバー上のプロキシノードを運用するための軽量 WebUI です。サーバー登録、Hysteria2/Trojan のデプロイ、ノード状態の同期、クライアント IP のブロック、リモートツール、ターミナル操作、hook のアップグレードを一つの管理画面にまとめ、個人または小規模チームが分散したノードを見通しよく管理できるようにします。

構成は Vue 3 フロントエンド、Node.js/Express のコントロールプレーン、リモート hook agent、任意の Electron WebView シェルです。WebUI は操作の調整と可視化を担当し、実際のノード設定、サービス状態、診断処理は管理対象サーバー側で行われます。

## 向いている用途

- 1 台の管理サーバーから複数のプロキシサーバーを管理したい。
- WebUI から Hysteria2 または Trojan ノードをデプロイ、保守したい。
- リモート状態の確認、クライアント IP のブロック、診断ツール実行、ターミナル操作をパネルから行いたい。
- ローカル開発ではログイン不要にしつつ、本番デプロイでは標準で認証を有効にしたい。

## 主な機能

- **サーバー登録**: 初回のみ SSH で永続 hook をインストールし、その後は hook チャネルで保守操作を実行します。
- **ワンクリックデプロイ**: Hysteria2 と Trojan に対応し、証明書モード、ポート、パスワード、サービス設定を指定できます。
- **ノード検出**: 既存の sing-box ノードを監視対象にできます。Shadowsocks、VMess、VLESS、Naive、Hysteria、ShadowTLS、TUIC、AnyTLS、WireGuard、SOCKS、HTTP、Mixed に対応します。
- **リモート保守**: サービス再起動、状態更新、クライアント IP ブロック、ツール実行、hook のオンラインアップグレード、リモートターミナルを提供します。
- **安全な既定値**: 本番モードは既定でログイン必須です。初回起動時にランダム UUID の初期パスワードを生成します。開発モードではログイン不要です。
- **デスクトップモード**: Electron WebView として実行でき、デスクトップパッケージも作成できます。

## アーキテクチャ

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

主要ディレクトリ：

| Path | 説明 |
| --- | --- |
| `src/` | Vue 3 フロントエンド |
| `server/` | Express API、認証、ジョブストリーム、SSH、hook オーケストレーション |
| `server/lib/hook-agent.js` | リモート hook agent の中核ロジック |
| `scripts/install-webui.sh` | WebUI のインストール、更新、アンインストールスクリプト |
| `desktop/` | Electron デスクトップシェル |
| `data/` | ローカル状態、デモデータ、アーカイブデータ |

## WebUI のインストール

WebUI は管理サーバーにインストールし、リバースプロキシ、VPN、または SSH tunnel 経由でアクセスすることを推奨します。既定では `127.0.0.1:8787` のみで待ち受けます。

```bash
curl -fsSL https://raw.githubusercontent.com/Hill-1024/simpleUI/main/scripts/install-webui.sh | sudo env SIMPLEUI_HOST=127.0.0.1 SIMPLEUI_PORT=8787 bash
```

明示的に外部公開したい場合：

```bash
curl -fsSL https://raw.githubusercontent.com/Hill-1024/simpleUI/main/scripts/install-webui.sh | sudo env SIMPLEUI_HOST=0.0.0.0 SIMPLEUI_PORT=8787 bash
```

インストール後に開きます：

```text
http://server-address:8787
```

初回起動時に WebUI の初期パスワードが生成されます。インストーラーは可能な限り直接表示します。見つからない場合は systemd ログを確認してください。

```bash
sudo journalctl -u simpleui-web.service --no-pager
```

## 更新とアンインストール

同じインストールコマンドを再実行すると、指定ブランチの最新バージョンへ更新できます。

```bash
curl -fsSL https://raw.githubusercontent.com/Hill-1024/simpleUI/main/scripts/install-webui.sh | sudo env SIMPLEUI_HOST=127.0.0.1 SIMPLEUI_PORT=8787 bash
```

インストール先、ブランチ、ポートを指定する例：

```bash
curl -fsSL https://raw.githubusercontent.com/Hill-1024/simpleUI/main/scripts/install-webui.sh | sudo env \
  SIMPLEUI_APP_DIR=/opt/simpleui \
  SIMPLEUI_BRANCH=main \
  SIMPLEUI_HOST=127.0.0.1 \
  SIMPLEUI_PORT=8787 \
  bash
```

サービス、アプリケーションディレクトリ、既定の実行ユーザーを削除します。

```bash
curl -fsSL https://raw.githubusercontent.com/Hill-1024/simpleUI/main/scripts/install-webui.sh | sudo bash -s -- uninstall
```

`/opt/simpleui` のデータディレクトリを残す場合：

```bash
curl -fsSL https://raw.githubusercontent.com/Hill-1024/simpleUI/main/scripts/install-webui.sh | sudo env SIMPLEUI_KEEP_DATA=1 bash -s -- uninstall
```

## 基本フロー

1. WebUI にログインし、About ページで初期パスワードを変更します。
2. Servers ページで SSH ホスト、ポート、ユーザー、パスワードを入力し、hook のインストール完了を待ちます。
3. Deploy ページでオンラインのサーバーを選び、Hysteria2 または Trojan ノードをデプロイします。
4. 既存の sing-box ノードは自動検出できます。標準外の設定は Nodes ページで手動追加できます。
5. Overview、Nodes、IP Blocking、Tools、Terminal ページで状態確認と保守操作を行います。
6. オンライン hook は Servers ページから直接アップグレードできます。SSH 再インストールが必要なのは、初回登録、hook オフライン時、または古い hook がオンラインアップグレード非対応の場合です。

## ローカル開発

```bash
pnpm install
pnpm dev
```

フロントエンドは `http://127.0.0.1:5173`、API は既定で `http://127.0.0.1:8787` で動作します。

開発モードはローカル調整用で、ログインページを表示しません。本番モードでは既定で認証が有効です。

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm start
```

よく使うスクリプト：

| Command | 説明 |
| --- | --- |
| `pnpm dev` | フロントエンドと API の開発サービスを同時に起動 |
| `pnpm dev:web` | Vite フロントエンドのみ起動 |
| `pnpm dev:api` | Express API のみ起動 |
| `pnpm build` | Web フロントエンドをビルド |
| `pnpm start` | 本番モードでコントロールプレーンを起動 |
| `pnpm check` | プロジェクトチェックを実行 |
| `pnpm desktop` | Electron デスクトップモードを起動 |
| `pnpm desktop:dist` | デスクトップ配布パッケージを作成 |

## 運用コマンド

```bash
sudo systemctl status simpleui-web
sudo systemctl restart simpleui-web
sudo journalctl -u simpleui-web -f
```

## Release 成果物

GitHub Release では以下の成果物を生成します。

| Platform | Artifacts |
| --- | --- |
| Windows x64 | `exe` / `zip` |
| macOS arm64 | `dmg` / `zip` |
| Linux x64 | `deb` / `zip` |

## セキュリティメモ

- 本番インストールは既定で `127.0.0.1` にのみ listen します。公開前にリバースプロキシ、TLS、アクセス制御、または VPN を用意してください。
- 初期パスワードはブートストラップ用です。デプロイ後に変更してください。
- リモートサーバー資格情報は信頼できる環境でのみ扱ってください。hook がオンラインになった後は、日常保守で SSH 資格情報を繰り返し入力しない運用を推奨します。
- パネルにはリモートコマンドとターミナル機能があります。本番インスタンスを信頼できないネットワークへ公開しないでください。

## Credits

SimpleUI のデプロイと診断フローは、以下のプロジェクトとエコシステムから着想を得ています。

- [Hysteria](https://github.com/apernet/hysteria)
- [seagullz4/hysteria2](https://github.com/seagullz4/hysteria2)
- [trojan-gfw/trojan](https://github.com/trojan-gfw/trojan)
- [xyz690/Trojan](https://github.com/xyz690/Trojan)
- [SagerNet/sing-box](https://github.com/SagerNet/sing-box)
- [xykt/IPQuality](https://github.com/xykt/IPQuality)
- [ylx2016/Linux-NetSpeed](https://github.com/ylx2016/Linux-NetSpeed)

## ライセンス

このリポジトリでは、まだオープンソースライセンスを明示していません。再利用、再配布、商用利用の前に、メンテナーへ利用条件を確認してください。
