<script setup>
import { computed } from "vue";
import {
  Server,
  ShieldCheck,
  X,
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
  EmptyState
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

const editInputClass =
  "w-full px-2.5 py-1.5 rounded-lg bg-[rgb(var(--md-surface-container-high)/0.5)] border border-[rgb(var(--md-outline-variant)/0.9)] focus:border-primary/70 focus:outline-none focus:ring-2 focus:ring-primary/15 type-body-md text-onSurface transition-all duration-250 ease-out-soft";
</script>

<template>
  <div class="flex flex-col gap-6">
    <!-- Install / re-install form -->
    <Surface v-reveal variant="panel" radius="2xl" padding="lg">
      <header class="flex items-center gap-2.5 mb-5">
        <span class="grid place-items-center h-8 w-8 rounded-[10px] bg-primary/10 text-primary">
          <PlusCircle :size="15" />
        </span>
        <h2 class="type-title-lg text-onSurface">{{ isEditing ? "重装 Hook" : "添加服务器" }}</h2>
      </header>

      <div
        v-if="isEditing"
        class="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-warningContainer text-onWarningContainer mb-5"
      >
        <AlertTriangle :size="15" class="shrink-0 mt-0.5" />
        <p class="type-body-sm">
          重装 <strong>{{ serverForm.name }}</strong> 的 Hook，请填写 SSH 登录信息。
        </p>
      </div>

      <form class="flex flex-col gap-6" @submit.prevent="installServer">
        <section class="flex flex-col gap-4">
          <p class="type-eyebrow text-onSurfaceVariant/85">接入配置</p>
          <div class="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            <TextField v-model="serverForm.name" label="服务器名" required />
            <TextField v-model="serverForm.group" label="分组" placeholder="可选,如 Osaka / HK" />
            <TextField v-model="serverForm.host" label="SSH 主机" placeholder="IPv4 / 域名 / [IPv6]" required />
            <TextField v-model.number="serverForm.port" label="SSH 端口" type="number" inputmode="numeric" />
          </div>
        </section>

        <section class="flex flex-col gap-4">
          <p class="type-eyebrow text-onSurfaceVariant/85">凭据与 Hook</p>
          <div class="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            <TextField v-model="serverCredential.username" label="SSH 用户" required autocomplete="username" />
            <TextField v-model="serverCredential.password" label="SSH 密码" type="password" autocomplete="current-password" />
            <TextField v-model.number="serverForm.hookPort" label="Hook 端口" type="number" inputmode="numeric" />
            <TextField v-model="serverForm.location" label="地区" placeholder="可选" />
          </div>
        </section>

        <div class="flex gap-2.5 flex-wrap pt-1">
          <Button type="submit" variant="filled" :loading="busy">
            <template #leading>
              <ShieldCheck :size="16" />
            </template>
            {{ isEditing ? "通过 SSH 重装 Hook" : "添加服务器并安装 Hook" }}
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
    <Surface v-reveal="80" variant="panel" radius="2xl" padding="lg">
      <header class="flex items-center justify-between gap-3 mb-5 flex-wrap">
        <div class="flex items-center gap-2.5">
          <span class="grid place-items-center h-8 w-8 rounded-[10px] bg-primary/10 text-primary">
            <Server :size="15" />
          </span>
          <h2 class="type-title-lg text-onSurface">服务器</h2>
          <Chip variant="outlined" size="sm">{{ state.servers.length }}</Chip>
        </div>
        <Switch v-model="serversGrouped" label="按分组展示" />
      </header>

      <EmptyState
        v-if="!state.servers.length"
        :icon="Server"
        title="还没有服务器"
        description="使用上方表单添加第一台服务器。"
      />
      <div v-else class="overflow-x-auto -mx-1 px-1">
        <table class="w-full border-separate border-spacing-0 min-w-[1000px]">
          <thead>
            <tr class="text-left type-eyebrow text-onSurfaceVariant/80">
              <th class="px-2.5 pb-3 font-semibold">服务器</th>
              <th class="px-2.5 pb-3 font-semibold">分组</th>
              <th class="px-2.5 pb-3 font-semibold">资源</th>
              <th class="px-2.5 pb-3 font-semibold">网络</th>
              <th class="px-2.5 pb-3 font-semibold">状态</th>
              <th class="px-2.5 pb-3 font-semibold">同步</th>
              <th class="px-2 pb-3 font-semibold text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="row in serverRows" :key="row.key">
              <tr v-if="row.type === 'group'">
                <td colspan="7" class="px-2.5 pt-5 pb-2.5">
                  <div class="flex items-baseline gap-2">
                    <span class="type-title-sm text-onSurface">{{ row.label }}</span>
                    <span class="type-body-sm text-onSurfaceVariant">{{ row.count }} 台服务器</span>
                  </div>
                </td>
              </tr>
              <tr
                v-else
                class="align-top transition-colors duration-250 hover:bg-[rgb(var(--md-surface-container-high)/0.35)]"
              >
                <td class="px-2.5 py-3.5 border-t border-[rgb(var(--md-outline-variant)/0.45)] dark:border-white/5">
                  <template v-if="editingServerId === row.server.id">
                    <input v-model="serverEditForm.name" :class="editInputClass" required />
                    <div class="flex gap-1.5 mt-1.5 min-w-56">
                      <input v-model="serverEditForm.host" :class="editInputClass" required />
                      <input
                        v-model.number="serverEditForm.port"
                        class="w-20 px-2.5 py-1.5 rounded-lg bg-[rgb(var(--md-surface-container-high)/0.5)] border border-[rgb(var(--md-outline-variant)/0.9)] focus:border-primary/70 focus:outline-none focus:ring-2 focus:ring-primary/15 type-body-sm text-onSurface transition-all duration-250"
                        type="number"
                      />
                    </div>
                  </template>
                  <template v-else>
                    <p class="type-title-sm text-onSurface">
                      {{ row.server.name }}<span v-if="row.server.location" class="type-body-sm text-onSurfaceVariant font-normal"> · {{ row.server.location }}</span>
                    </p>
                    <p class="type-body-sm text-onSurfaceVariant font-mono mt-0.5 whitespace-nowrap">
                      {{ row.server.sshUserHint || "root" }}@{{ row.server.host }}:{{ row.server.port || 22 }}
                    </p>
                  </template>
                </td>

                <td class="px-2.5 py-3.5 border-t border-[rgb(var(--md-outline-variant)/0.45)] dark:border-white/5">
                  <input
                    v-if="editingServerId === row.server.id"
                    v-model="serverEditForm.group"
                    :class="editInputClass"
                    placeholder="可选"
                  />
                  <Chip v-else size="sm" variant="tonal" color="secondary">{{ groupLabel(row.server.group) }}</Chip>
                </td>

                <td class="px-2.5 py-3.5 border-t border-[rgb(var(--md-outline-variant)/0.45)] dark:border-white/5">
                  <div class="flex flex-col gap-1.5 min-w-[150px]">
                    <div class="flex items-center gap-2">
                      <span class="type-label-md text-onSurface w-9">CPU</span>
                      <span class="flex-1 h-1 rounded-full bg-[rgb(var(--md-surface-container-highest)/0.8)] dark:bg-white/8 overflow-hidden">
                        <span
                          class="block h-full rounded-full transition-[width] duration-700 ease-signature"
                          :class="(row.server.metrics?.cpu?.usagePercent || 0) >= 88 ? 'bg-error' : (row.server.metrics?.cpu?.usagePercent || 0) >= 70 ? 'bg-warning' : 'bg-primary'"
                          :style="{ width: `${row.server.metrics?.cpu?.usagePercent || 0}%` }"
                        />
                      </span>
                      <span class="type-label-md text-onSurfaceVariant tabular-nums w-10 text-right">{{ fmtPercent(row.server.metrics?.cpu?.usagePercent) }}</span>
                    </div>
                    <div class="flex items-center gap-2">
                      <span class="type-label-md text-onSurface w-9">Mem</span>
                      <span class="flex-1 h-1 rounded-full bg-[rgb(var(--md-surface-container-highest)/0.8)] dark:bg-white/8 overflow-hidden">
                        <span
                          class="block h-full rounded-full transition-[width] duration-700 ease-signature"
                          :class="(row.server.metrics?.memory?.usedPercent || 0) >= 88 ? 'bg-error' : (row.server.metrics?.memory?.usedPercent || 0) >= 70 ? 'bg-warning' : 'bg-primary'"
                          :style="{ width: `${row.server.metrics?.memory?.usedPercent || 0}%` }"
                        />
                      </span>
                      <span class="type-label-md text-onSurfaceVariant tabular-nums w-10 text-right">{{ fmtPercent(row.server.metrics?.memory?.usedPercent) }}</span>
                    </div>
                    <div class="flex items-center gap-2">
                      <span class="type-label-md text-onSurface w-9">Disk</span>
                      <span class="flex-1 h-1 rounded-full bg-[rgb(var(--md-surface-container-highest)/0.8)] dark:bg-white/8 overflow-hidden">
                        <span
                          class="block h-full rounded-full transition-[width] duration-700 ease-signature"
                          :class="(row.server.metrics?.disk?.usedPercent || 0) >= 88 ? 'bg-error' : (row.server.metrics?.disk?.usedPercent || 0) >= 70 ? 'bg-warning' : 'bg-primary'"
                          :style="{ width: `${row.server.metrics?.disk?.usedPercent || 0}%` }"
                        />
                      </span>
                      <span class="type-label-md text-onSurfaceVariant tabular-nums w-10 text-right">{{ fmtPercent(row.server.metrics?.disk?.usedPercent) }}</span>
                    </div>
                    <span class="type-body-sm text-onSurfaceVariant tabular-nums">
                      Load {{ row.server.metrics?.cpu?.load1 ?? "-" }} / {{ row.server.metrics?.cpu?.cores || "-" }} 核
                    </span>
                  </div>
                </td>

                <td class="px-2.5 py-3.5 border-t border-[rgb(var(--md-outline-variant)/0.45)] dark:border-white/5">
                  <div class="flex flex-col gap-1 type-body-sm tabular-nums whitespace-nowrap">
                    <span class="text-onSurface inline-flex items-center gap-1.5">
                      <ArrowDownToLine :size="12" class="text-primary" />{{ fmtRate(row.server.metrics?.network?.rxRate || 0) }}
                    </span>
                    <span class="text-onSurfaceVariant inline-flex items-center gap-1.5">
                      <ArrowUpFromLine :size="12" />{{ fmtRate(row.server.metrics?.network?.txRate || 0) }}
                    </span>
                    <span class="text-onSurfaceVariant/80">
                      {{ fmtBytes(row.server.metrics?.network?.rx || 0) }} / {{ fmtBytes(row.server.metrics?.network?.tx || 0) }}
                    </span>
                  </div>
                </td>

                <td class="px-2.5 py-3.5 border-t border-[rgb(var(--md-outline-variant)/0.45)] dark:border-white/5">
                  <Chip :color="statusColor(row.server.hookStatus || row.server.status)" variant="tonal" size="sm" dot>
                    {{ statusLabel(row.server.hookStatus || row.server.status) }}
                  </Chip>
                </td>

                <td class="px-2.5 py-3.5 border-t border-[rgb(var(--md-outline-variant)/0.45)] dark:border-white/5">
                  <div v-if="editingServerId === row.server.id" class="flex flex-col gap-1.5 min-w-36">
                    <input
                      v-model.number="serverEditForm.hookPort"
                      :class="editInputClass"
                      type="number"
                    />
                    <input
                      v-model="serverEditForm.location"
                      :class="editInputClass"
                      placeholder="地区,可选"
                    />
                  </div>
                  <div v-else class="flex flex-col gap-1 type-body-sm">
                    <span class="text-onSurfaceVariant tabular-nums whitespace-nowrap">{{ fmtTime(row.server.metrics?.updatedAt) }}</span>
                    <span v-if="row.server.metrics?.lastSyncError" class="text-error max-w-[150px]">{{ row.server.metrics.lastSyncError }}</span>
                    <span
                      v-else
                      class="text-onSurfaceVariant/70 font-mono block max-w-[150px] truncate"
                      :title="row.server.hookUrl || '未安装'"
                    >{{ row.server.hookUrl || "未安装" }}</span>
                  </div>
                </td>

                <td class="px-2 py-3.5 border-t border-[rgb(var(--md-outline-variant)/0.45)] dark:border-white/5">
                  <div class="flex items-center gap-0.5 justify-end">
                    <template v-if="editingServerId === row.server.id">
                      <IconButton variant="filled" size="sm" label="保存" :disabled="busy" @click="saveServer(row.server)">
                        <Save :size="14" />
                      </IconButton>
                      <IconButton variant="standard" size="sm" label="取消" :disabled="busy" @click="cancelEditServer">
                        <X :size="14" />
                      </IconButton>
                    </template>
                    <template v-else>
                      <IconButton variant="standard" size="sm" label="升级 Hook" :disabled="busy || !row.server.hookUrl || row.server.hookStatus === 'deleting'" @click="upgradeHook(row.server)">
                        <ShieldCheck :size="14" />
                      </IconButton>
                      <IconButton variant="standard" size="sm" label="信任 Hook 证书" :disabled="busy || !row.server.hookSecurity?.mismatch" @click="trustHookCertificate(row.server)">
                        <SearchCheck :size="14" />
                      </IconButton>
                      <IconButton variant="standard" size="sm" label="通过 SSH 重装 Hook" :disabled="busy" @click="prepareHookUpgrade(row.server)">
                        <RefreshCcw :size="14" />
                      </IconButton>
                      <IconButton variant="standard" size="sm" label="编辑" :disabled="busy" @click="startEditServer(row.server)">
                        <Pencil :size="14" />
                      </IconButton>
                      <IconButton variant="warning" size="sm" label="重启服务器" :disabled="busy || row.server.hookStatus !== 'online'" @click="rebootServer(row.server)">
                        <RotateCw :size="14" />
                      </IconButton>
                      <IconButton variant="danger" size="sm" label="卸载 Hook 并删除" :disabled="busy || row.server.hookStatus === 'deleting'" @click="deleteServer(row.server)">
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
