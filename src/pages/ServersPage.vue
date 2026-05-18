<script setup>
import { computed } from "vue";
import {
  Server,
  ShieldCheck,
  X,
  Save,
  SearchCheck,
  RefreshCcw,
  Pencil,
  RotateCw,
  Trash2,
  Eraser,
  PlusCircle,
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine
} from "lucide-vue-next";
import {
  Surface,
  Button,
  IconButton,
  Chip,
  TextField,
  Switch,
  EmptyState,
  ProgressBar
} from "../components/ui";
import { useAppBindings } from "../composables/useAppBindings.js";

const {
  state,
  serverForm,
  serverCredential,
  serverEditForm,
  editingServerId,
  serverRows,
  serversGrouped,
  busy,
  installServer,
  resetServerForm,
  saveServer,
  upgradeHook,
  trustHookCertificate,
  prepareHookUpgrade,
  startEditServer,
  cancelEditServer,
  rebootServer,
  deleteServer,
  forceClearServer,
  groupLabel,
  statusLabel,
  fmtPercent,
  fmtBytes,
  fmtRate,
  fmtTime
} = useAppBindings();

const isEditing = computed(() => Boolean(serverForm.value.id));

const statusColorMap = {
  online: "success",
  offline: "error",
  installing: "warning",
  upgrading: "warning",
  deleting: "error",
  unknown: "neutral"
};

function statusColor(status) {
  return statusColorMap[status] || "neutral";
}
</script>

<template>
  <div class="flex flex-col gap-5">
    <!-- Install / re-install form -->
    <Surface variant="panel" radius="2xl" padding="lg">
      <header class="flex items-center justify-between gap-3 mb-4">
        <div class="flex items-center gap-2">
          <PlusCircle :size="18" class="text-primary" />
          <h2 class="type-title-lg text-onSurface">{{ isEditing ? "重装 Hook" : "添加服务器" }}</h2>
        </div>
      </header>

      <div
        v-if="isEditing"
        class="flex items-start gap-2 px-4 py-3 rounded-2xl bg-warningContainer text-onWarningContainer mb-4"
      >
        <AlertTriangle :size="16" class="shrink-0 mt-0.5" />
        <p class="type-body-sm">
          正在通过 SSH 重装 <strong>{{ serverForm.name }}</strong> 的持久化 hook;只有首次接入、hook 离线或旧 hook 不支持在线升级时才需要这条路径。
        </p>
      </div>

      <form class="flex flex-col gap-4" @submit.prevent="installServer">
        <div class="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          <TextField v-model="serverForm.name" label="服务器名" required />
          <TextField v-model="serverForm.group" label="分组" placeholder="可选,如 Osaka / HK" />
          <TextField v-model="serverForm.host" label="SSH 主机" placeholder="IPv4 / 域名 / [IPv6]" required />
          <TextField v-model.number="serverForm.port" label="SSH 端口" type="number" inputmode="numeric" />
          <TextField v-model="serverCredential.username" label="SSH 用户" required autocomplete="username" />
          <TextField v-model="serverCredential.password" label="SSH 密码" type="password" autocomplete="current-password" />
          <TextField v-model.number="serverForm.hookPort" label="Hook 端口" type="number" inputmode="numeric" />
          <TextField v-model="serverForm.location" label="地区" placeholder="可选" />
        </div>
        <p class="type-body-sm text-onSurfaceVariant">
          SSH 凭据只用于 bootstrap 或离线恢复;hook 在线后可直接在服务器列表中执行在线升级。
        </p>
        <div class="flex gap-2 flex-wrap">
          <Button type="submit" variant="filled" :loading="busy">
            <template #leading>
              <ShieldCheck :size="16" />
            </template>
            {{ isEditing ? "通过 SSH 重装 hook" : "添加服务器并安装 hook" }}
          </Button>
          <Button v-if="isEditing" type="button" variant="text" :disabled="busy" @click="resetServerForm">
            <template #leading>
              <X :size="15" />
            </template>
            取消
          </Button>
        </div>
      </form>
    </Surface>

    <!-- Server list -->
    <Surface variant="panel" radius="2xl" padding="lg">
      <header class="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div class="flex items-center gap-2">
          <Server :size="18" class="text-primary" />
          <h2 class="type-title-lg text-onSurface">服务器</h2>
          <Chip variant="outlined" size="sm">{{ state.servers.length }}</Chip>
        </div>
        <Switch v-model="serversGrouped" label="按分组展示" />
      </header>

      <EmptyState
        v-if="!state.servers.length"
        :icon="Server"
        title="还没有服务器"
        description="使用上方表单添加服务器,并等待 Hook 安装完成。"
      />
      <div v-else class="overflow-x-auto -mx-2">
        <table class="w-full border-separate border-spacing-0">
          <thead>
            <tr class="text-left type-label-md text-onSurfaceVariant">
              <th class="px-3 py-2 font-medium">服务器</th>
              <th class="px-3 py-2 font-medium">分组</th>
              <th class="px-3 py-2 font-medium">主机</th>
              <th class="px-3 py-2 font-medium">资源</th>
              <th class="px-3 py-2 font-medium">网络</th>
              <th class="px-3 py-2 font-medium">状态</th>
              <th class="px-3 py-2 font-medium">地区</th>
              <th class="px-3 py-2 font-medium">同步</th>
              <th class="px-3 py-2 font-medium text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="row in serverRows" :key="row.key">
              <tr v-if="row.type === 'group'">
                <td colspan="9" class="px-3 pt-5 pb-2">
                  <div class="flex items-baseline gap-2">
                    <span class="type-title-sm text-onSurface">{{ row.label }}</span>
                    <span class="type-body-sm text-onSurfaceVariant">{{ row.count }} 台服务器</span>
                  </div>
                </td>
              </tr>
              <tr
                v-else
                class="align-top hover:bg-surfaceContainerLow/40 transition-colors duration-150"
              >
                <td class="px-3 py-3 border-t border-outlineVariant/30">
                  <template v-if="editingServerId === row.server.id">
                    <input
                      v-model="serverEditForm.name"
                      class="w-full px-2 py-1 rounded-sm bg-surfaceContainerLow border border-outline focus:border-primary focus:outline-none type-body-md"
                      required
                    />
                  </template>
                  <template v-else>
                    <p class="type-title-sm text-onSurface">{{ row.server.name }}</p>
                  </template>
                  <p class="type-body-sm text-onSurfaceVariant font-mono mt-0.5">
                    {{ row.server.sshUserHint || "root" }}@{{ row.server.host }}
                  </p>
                </td>

                <td class="px-3 py-3 border-t border-outlineVariant/30">
                  <input
                    v-if="editingServerId === row.server.id"
                    v-model="serverEditForm.group"
                    class="w-24 px-2 py-1 rounded-sm bg-surfaceContainerLow border border-outline focus:border-primary focus:outline-none type-body-md"
                    placeholder="可选"
                  />
                  <Chip v-else size="sm" variant="tonal" color="secondary">{{ groupLabel(row.server.group) }}</Chip>
                </td>

                <td class="px-3 py-3 border-t border-outlineVariant/30 type-body-sm text-onSurfaceVariant">
                  <div v-if="editingServerId === row.server.id" class="flex gap-1.5">
                    <input
                      v-model="serverEditForm.host"
                      class="flex-1 px-2 py-1 rounded-sm bg-surfaceContainerLow border border-outline focus:border-primary focus:outline-none type-body-sm"
                      required
                    />
                    <input
                      v-model.number="serverEditForm.port"
                      class="w-16 px-2 py-1 rounded-sm bg-surfaceContainerLow border border-outline focus:border-primary focus:outline-none type-body-sm"
                      type="number"
                    />
                  </div>
                  <span v-else class="font-mono">{{ row.server.host }}:{{ row.server.port || 22 }}</span>
                </td>

                <td class="px-3 py-3 border-t border-outlineVariant/30">
                  <div class="flex flex-col gap-1 min-w-[140px]">
                    <span class="type-label-md text-onSurface">CPU {{ fmtPercent(row.server.metrics?.cpu?.usagePercent) }}</span>
                    <span class="type-body-sm text-onSurfaceVariant">
                      Mem {{ fmtPercent(row.server.metrics?.memory?.usedPercent) }} · Disk {{ fmtPercent(row.server.metrics?.disk?.usedPercent) }}
                    </span>
                    <span class="type-body-sm text-onSurfaceVariant">
                      Load {{ row.server.metrics?.cpu?.load1 ?? "-" }} / {{ row.server.metrics?.cpu?.cores || "-" }} 核
                    </span>
                  </div>
                </td>

                <td class="px-3 py-3 border-t border-outlineVariant/30">
                  <div class="flex flex-col gap-0.5 type-body-sm">
                    <span class="text-onSurface inline-flex items-center gap-1">
                      <ArrowDownToLine :size="12" />{{ fmtRate(row.server.metrics?.network?.rxRate || 0) }}
                    </span>
                    <span class="text-onSurfaceVariant inline-flex items-center gap-1">
                      <ArrowUpFromLine :size="12" />{{ fmtRate(row.server.metrics?.network?.txRate || 0) }}
                    </span>
                    <span class="text-onSurfaceVariant">
                      {{ fmtBytes(row.server.metrics?.network?.rx || 0) }} / {{ fmtBytes(row.server.metrics?.network?.tx || 0) }}
                    </span>
                  </div>
                </td>

                <td class="px-3 py-3 border-t border-outlineVariant/30">
                  <Chip :color="statusColor(row.server.hookStatus || row.server.status)" variant="tonal" size="sm" dot>
                    {{ statusLabel(row.server.hookStatus || row.server.status) }}
                  </Chip>
                </td>

                <td class="px-3 py-3 border-t border-outlineVariant/30 type-body-sm">
                  <input
                    v-if="editingServerId === row.server.id"
                    v-model="serverEditForm.location"
                    class="w-24 px-2 py-1 rounded-sm bg-surfaceContainerLow border border-outline focus:border-primary focus:outline-none type-body-sm"
                  />
                  <span v-else class="text-onSurface">{{ row.server.location || "-" }}</span>
                </td>

                <td class="px-3 py-3 border-t border-outlineVariant/30">
                  <div v-if="editingServerId === row.server.id" class="flex flex-col gap-1">
                    <input
                      v-model.number="serverEditForm.hookPort"
                      class="w-20 px-2 py-1 rounded-sm bg-surfaceContainerLow border border-outline focus:border-primary focus:outline-none type-body-sm"
                      type="number"
                    />
                    <span class="type-body-sm text-onSurfaceVariant font-mono break-all">{{ row.server.hookUrl || "未安装" }}</span>
                  </div>
                  <div v-else class="flex flex-col gap-0.5 type-body-sm">
                    <span class="text-onSurfaceVariant">{{ fmtTime(row.server.metrics?.updatedAt) }}</span>
                    <span v-if="row.server.metrics?.lastSyncError" class="text-error">{{ row.server.metrics.lastSyncError }}</span>
                    <span v-else class="text-onSurfaceVariant font-mono block max-w-[260px] break-all">{{ row.server.hookUrl || "未安装" }}</span>
                  </div>
                </td>

                <td class="px-3 py-3 border-t border-outlineVariant/30">
                  <div class="flex items-center gap-1 justify-end">
                    <template v-if="editingServerId === row.server.id">
                      <IconButton variant="filled" size="sm" label="保存" :disabled="busy" @click="saveServer(row.server)">
                        <Save :size="14" />
                      </IconButton>
                      <IconButton variant="standard" size="sm" label="取消" :disabled="busy" @click="cancelEditServer">
                        <X :size="14" />
                      </IconButton>
                    </template>
                    <template v-else>
                      <IconButton variant="standard" size="sm" label="在线升级 hook" :disabled="busy || !row.server.hookUrl || row.server.hookStatus === 'deleting'" @click="upgradeHook(row.server)">
                        <ShieldCheck :size="14" />
                      </IconButton>
                      <IconButton variant="standard" size="sm" label="信任 Hook 证书" :disabled="busy || !row.server.hookSecurity?.mismatch" @click="trustHookCertificate(row.server)">
                        <SearchCheck :size="14" />
                      </IconButton>
                      <IconButton variant="standard" size="sm" label="通过 SSH 重装 hook" :disabled="busy" @click="prepareHookUpgrade(row.server)">
                        <RefreshCcw :size="14" />
                      </IconButton>
                      <IconButton variant="standard" size="sm" label="编辑" :disabled="busy" @click="startEditServer(row.server)">
                        <Pencil :size="14" />
                      </IconButton>
                      <IconButton variant="warning" size="sm" label="重启服务器" :disabled="busy || row.server.hookStatus !== 'online'" @click="rebootServer(row.server)">
                        <RotateCw :size="14" />
                      </IconButton>
                      <IconButton variant="danger" size="sm" label="卸载 hook 并删除" :disabled="busy || row.server.hookStatus === 'deleting'" @click="deleteServer(row.server)">
                        <Trash2 :size="14" />
                      </IconButton>
                      <IconButton variant="danger" size="sm" label="强制清除本地记录" :disabled="busy" @click="forceClearServer(row.server)">
                        <Eraser :size="14" />
                      </IconButton>
                    </template>
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </Surface>
  </div>
</template>
