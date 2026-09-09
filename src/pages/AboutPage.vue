<script setup>
import {
  Info,
  PackageCheck,
  ShieldCheck,
  ExternalLink,
  Save
} from "lucide-vue-next";
import {
  Surface,
  Button,
  Chip,
  TextField
} from "../components/ui";
import { useAppBindings } from "../composables/useAppBindings.js";

const {
  projectInfo,
  releaseTargets,
  passwordForm,
  authBusy,
  changeWebPassword
} = useAppBindings();
</script>

<template>
  <div class="flex flex-col gap-6">
    <!-- Brand hero -->
    <Surface v-reveal variant="elevated" radius="2xl" padding="lg" class="flex items-center gap-6 flex-wrap">
      <div class="relative">
        <div class="absolute inset-0 rounded-[1.5rem] bg-primary/30 blur-xl" aria-hidden="true" />
        <div class="relative grid place-items-center h-16 w-16 rounded-[1.5rem] bg-gradient-to-b from-primary to-[rgb(var(--md-on-primary-container))] text-onPrimary type-headline-md font-bold specular-ring shadow-elev-2">
          S
        </div>
      </div>
      <div class="min-w-0 flex-1">
        <h2 class="type-headline-sm text-onSurface">{{ projectInfo.name }}</h2>
        <p class="type-body-md text-onSurfaceVariant mt-1.5 max-w-2xl">
          管理多台服务器上的 Hysteria2 / Trojan 节点。
        </p>
      </div>
      <Chip variant="tonal" color="primary" size="md" class="font-mono">v{{ projectInfo.version }}</Chip>
    </Surface>

    <div class="grid gap-5 grid-cols-1 lg:grid-cols-3">
      <Surface v-reveal="70" variant="panel" radius="2xl" padding="lg" class="flex flex-col gap-5">
        <header class="flex items-center gap-2.5">
          <span class="grid place-items-center h-8 w-8 rounded-[10px] bg-primary/10 text-primary">
            <Info :size="15" />
          </span>
          <h3 class="type-title-md text-onSurface">项目信息</h3>
        </header>
        <dl class="grid gap-3.5">
          <div class="flex justify-between items-baseline gap-2 border-b border-[rgb(var(--md-outline-variant)/0.4)] dark:border-white/5 pb-3">
            <dt class="type-label-md text-onSurfaceVariant">作者</dt>
            <dd class="type-body-md text-onSurface">{{ projectInfo.author }}</dd>
          </div>
          <div class="flex justify-between items-baseline gap-2 border-b border-[rgb(var(--md-outline-variant)/0.4)] dark:border-white/5 pb-3">
            <dt class="type-label-md text-onSurfaceVariant">当前版本</dt>
            <dd class="type-body-md text-onSurface font-mono tabular-nums">{{ projectInfo.version }}</dd>
          </div>
          <div class="flex justify-between items-baseline gap-2 border-b border-[rgb(var(--md-outline-variant)/0.4)] dark:border-white/5 pb-3">
            <dt class="type-label-md text-onSurfaceVariant">发布日期</dt>
            <dd class="type-body-md text-onSurface tabular-nums">{{ projectInfo.releaseDate }}</dd>
          </div>
          <div class="flex justify-between items-baseline gap-2">
            <dt class="type-label-md text-onSurfaceVariant shrink-0">项目主页</dt>
            <dd class="min-w-0">
              <a
                :href="projectInfo.homepage"
                target="_blank"
                rel="noreferrer"
                class="inline-flex min-w-0 items-center gap-1.5 type-body-md text-primary break-all"
              >
                <span class="min-w-0 break-all">{{ projectInfo.homepage }}</span>
                <ExternalLink :size="13" class="shrink-0" />
              </a>
            </dd>
          </div>
        </dl>
      </Surface>

      <Surface v-reveal="140" variant="panel" radius="2xl" padding="lg" class="flex flex-col gap-5">
        <header class="flex items-center gap-2.5">
          <span class="grid place-items-center h-8 w-8 rounded-[10px] bg-primary/10 text-primary">
            <PackageCheck :size="15" />
          </span>
          <h3 class="type-title-md text-onSurface">支持平台</h3>
        </header>
        <div class="grid gap-2.5">
          <article
            v-for="target in releaseTargets"
            :key="`${target.platform}-${target.arch}`"
            class="rounded-xl bg-[rgb(var(--md-surface-container-high)/0.4)] border border-[rgb(var(--md-outline-variant)/0.5)] dark:border-white/6 px-3.5 py-3 flex items-center justify-between gap-2"
          >
            <div class="min-w-0">
              <p class="type-title-sm text-onSurface">{{ target.platform }}</p>
              <p class="type-body-sm text-onSurfaceVariant font-mono">{{ target.arch }}</p>
            </div>
            <Chip variant="outlined" size="xs">{{ target.packages }}</Chip>
          </article>
        </div>
      </Surface>

      <Surface v-reveal="210" variant="panel" radius="2xl" padding="lg" class="flex flex-col gap-5">
        <header class="flex items-center gap-2.5">
          <span class="grid place-items-center h-8 w-8 rounded-[10px] bg-primary/10 text-primary">
            <ShieldCheck :size="15" />
          </span>
          <h3 class="type-title-md text-onSurface">访问安全</h3>
        </header>
        <form class="flex flex-col gap-4" @submit.prevent="changeWebPassword">
          <TextField
            v-model="passwordForm.currentPassword"
            label="当前密码"
            type="password"
            autocomplete="current-password"
            required
          />
          <TextField
            v-model="passwordForm.newPassword"
            label="新密码"
            type="password"
            autocomplete="new-password"
            required
          />
          <TextField
            v-model="passwordForm.confirmPassword"
            label="确认新密码"
            type="password"
            autocomplete="new-password"
            required
          />
          <Button
            type="submit"
            variant="filled"
            :loading="authBusy"
            :disabled="!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword"
          >
            <template #leading>
              <Save :size="15" />
            </template>
            修改登录密码
          </Button>
        </form>
      </Surface>
    </div>
  </div>
</template>
