<script setup>
import { computed, onMounted, onUnmounted, toRef, watch } from "vue";
import { RouterLink, RouterView, useRoute } from "vue-router";
import {
  LayoutDashboard,
  Server,
  Rocket,
  Radio,
  ShieldBan,
  Wrench,
  Terminal,
  ScrollText,
  Info,
  Loader2,
  RefreshCw,
  LogOut,
  ShieldCheck,
  ChevronRight
} from "lucide-vue-next";
import BanNodeModal from "./components/BanNodeModal.vue";
import IpQualityReportModal from "./components/IpQualityReportModal.vue";
import ManualNodeModal from "./components/ManualNodeModal.vue";
import PageTaskPanel from "./components/PageTaskPanel.vue";
import { useAppStore } from "./stores/appStore.js";
import {
  Button,
  IconButton,
  TextField,
  ThemeToggle,
  Toast
} from "./components/ui";

const appStore = useAppStore();
const route = useRoute();
const auth = toRef(appStore, "auth");
const authBusy = toRef(appStore, "authBusy");
const loading = toRef(appStore, "loading");
const loginForm = toRef(appStore, "loginForm");
const pageMeta = toRef(appStore, "pageMeta");
const activePage = toRef(appStore, "activePage");
const toast = toRef(appStore, "toast");
const { login, logout, syncNow } = appStore;
const appVersion = __APP_VERSION__;

watch(
  () => route.name,
  (name) => appStore.setActivePage(typeof name === "string" ? name : "overview"),
  { immediate: true }
);

onMounted(() => appStore.startApp());
onUnmounted(() => appStore.stopApp());

const navItems = [
  { name: "overview", label: "总览", icon: LayoutDashboard, hint: "舰队全景" },
  { name: "servers", label: "服务器", icon: Server, hint: "Hook 与凭据" },
  { name: "deploy", label: "部署", icon: Rocket, hint: "Hy2 / Trojan" },
  { name: "nodes", label: "节点", icon: Radio, hint: "运行态与监控" },
  { name: "connections", label: "连接封禁", icon: ShieldBan, hint: "IP 黑名单" },
  { name: "tools", label: "工具", icon: Wrench, hint: "优化与诊断" },
  { name: "terminal", label: "终端", icon: Terminal, hint: "远程命令" },
  { name: "logs", label: "日志", icon: ScrollText, hint: "任务输出" },
  { name: "about", label: "关于", icon: Info, hint: "项目信息" }
];

const toastVisible = computed(() => Boolean(toast.value));

function dismissToast() {
  toast.value = "";
}
</script>

<template>
  <!-- Auth: loading -->
  <div v-if="!auth.checked" class="min-h-screen grid place-items-center p-6">
    <section class="glass-elevated specular-edge rounded-3xl px-10 py-12 motion-scale-in flex flex-col items-center gap-5 w-[min(420px,100%)]">
      <div class="grid place-items-center h-14 w-14 rounded-2xl bg-primary text-onPrimary type-headline-md specular-edge">S</div>
      <h1 class="type-headline-md text-onSurface">SimpleUI</h1>
      <p class="type-body-md text-onSurfaceVariant flex items-center gap-2">
        <Loader2 :size="14" class="spin" /> 正在检查登录状态...
      </p>
    </section>
  </div>

  <!-- Auth: login -->
  <div v-else-if="!auth.authenticated" class="min-h-screen grid place-items-center p-6">
    <form
      class="glass-elevated specular-edge rounded-3xl px-8 py-10 motion-scale-in flex flex-col gap-6 w-[min(440px,100%)]"
      @submit.prevent="login"
    >
      <div class="flex items-center gap-3">
        <div class="grid place-items-center h-12 w-12 rounded-2xl bg-primary text-onPrimary type-headline-sm specular-edge">S</div>
        <div>
          <h1 class="type-headline-sm text-onSurface">SimpleUI</h1>
          <p class="type-body-sm text-onSurfaceVariant">Node Console · 持久化 Hook</p>
        </div>
      </div>
      <p class="type-body-md text-onSurfaceVariant">
        请输入首次启动时在 CLI 输出的 UUID 初始密码。
      </p>
      <TextField
        v-model="loginForm.password"
        label="WebUI 密码"
        type="password"
        autocomplete="current-password"
        autofocus
        required
      />
      <Button
        variant="filled"
        :loading="authBusy"
        :disabled="!loginForm.password"
        type="submit"
        size="lg"
        block
      >
        <template #leading>
          <ShieldCheck :size="18" />
        </template>
        登录控制台
      </Button>
      <div class="flex items-center justify-between">
        <span class="type-body-sm text-onSurfaceVariant">需要协助?</span>
        <ThemeToggle />
      </div>
    </form>
  </div>

  <!-- App shell -->
  <div v-else class="min-h-screen grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)]">
    <!-- Navigation Drawer -->
    <aside class="lg:sticky top-0 lg:h-screen px-3 py-3 lg:px-4 lg:py-5 flex flex-col gap-4 z-20">
      <div class="glass-rail specular-edge rounded-3xl lg:flex-1 flex flex-col gap-3 px-3 py-4 lg:py-5 overflow-visible">
        <div class="px-3 flex items-center gap-3">
          <div class="grid place-items-center h-10 w-10 rounded-2xl bg-primary text-onPrimary type-title-md specular-edge">S</div>
          <div class="min-w-0">
            <p class="type-title-md text-onSurface break-words">SimpleUI</p>
            <p class="type-body-sm text-onSurfaceVariant break-words">Node Console</p>
          </div>
        </div>

        <nav class="app-nav mt-1 -mx-1.5 px-1.5 py-1.5 lg:flex-1 lg:overflow-y-auto lg:pr-2.5 flex flex-row lg:flex-col gap-1 lg:gap-0.5 overflow-x-auto" aria-label="Primary">
          <RouterLink
            v-for="item in navItems"
            :key="item.name"
            :to="{ name: item.name }"
            class="state-layer group relative flex items-center gap-2 lg:gap-3 rounded-2xl px-3 py-2.5 transition-colors duration-200 ease-standard focus-ring shrink-0 lg:shrink"
            :class="
              activePage === item.name
                ? 'bg-secondaryContainer text-onSecondaryContainer'
                : 'text-onSurfaceVariant hover:text-onSurface'
            "
          >
            <span class="relative grid place-items-center h-9 w-9 rounded-xl shrink-0">
              <component :is="item.icon" :size="18" />
              <span
                v-if="activePage === item.name"
                class="absolute -left-3 top-1/2 -translate-y-1/2 h-5 w-1 rounded-full bg-primary"
              />
            </span>
            <div class="min-w-0 flex-1 flex flex-col">
              <span class="type-label-lg leading-tight">{{ item.label }}</span>
              <span class="type-body-sm leading-tight opacity-70 hidden sm:block">{{ item.hint }}</span>
            </div>
          </RouterLink>
        </nav>

        <div class="mt-2 mx-1 lg:mx-2 px-3 py-3 rounded-2xl bg-surfaceContainerHigh/40 backdrop-blur-md border border-outlineVariant/30 flex items-center gap-2.5">
          <ThemeToggle />
          <IconButton variant="standard" size="md" label="退出" @click="logout" :loading="authBusy">
            <LogOut :size="16" />
          </IconButton>
          <div class="ml-auto type-body-sm text-onSurfaceVariant">v{{ appVersion }}</div>
        </div>
      </div>
    </aside>

    <!-- Main column -->
    <main class="min-w-0 flex flex-col px-3 sm:px-6 py-4 sm:py-5 gap-5">
      <header class="glass-panel specular-edge rounded-3xl px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div class="min-w-0">
          <div class="flex items-center gap-1.5 type-label-md text-onSurfaceVariant mb-1">
            <span>SimpleUI</span>
            <ChevronRight :size="13" />
            <span class="text-onSurface">{{ pageMeta.title }}</span>
          </div>
          <h1 class="type-title-lg text-onSurface break-words">{{ pageMeta.title }}</h1>
          <p class="type-body-sm text-onSurfaceVariant mt-0.5 max-w-2xl break-words">
            {{ pageMeta.description }}
          </p>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <Button
            variant="tonal"
            size="md"
            :loading="loading"
            @click="syncNow"
          >
            <template #leading>
              <RefreshCw :size="15" />
            </template>
            同步
          </Button>
        </div>
      </header>

      <IpQualityReportModal />
      <BanNodeModal />
      <ManualNodeModal />
      <PageTaskPanel />

      <div class="flex-1 min-w-0">
        <RouterView v-slot="{ Component, route: r }">
          <Transition
            mode="out-in"
            enter-active-class="transition-all duration-300 ease-emphasized-decel"
            enter-from-class="opacity-0 translate-y-2"
            leave-active-class="transition-all duration-150 ease-emphasized-accel"
            leave-to-class="opacity-0 -translate-y-1"
          >
            <component :is="Component" :key="r.fullPath" />
          </Transition>
        </RouterView>
      </div>
    </main>
  </div>
  <Toast :show="toastVisible" :message="toast" variant="error" @dismiss="dismissToast" />
</template>
