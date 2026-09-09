<script setup>
import { computed, onMounted, onUnmounted, ref, toRef, watch } from "vue";
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
  X
} from "lucide-vue-next";
import BanNodeModal from "./components/BanNodeModal.vue";
import IpQualityReportModal from "./components/IpQualityReportModal.vue";
import ManualNodeModal from "./components/ManualNodeModal.vue";
import PageTaskPanel from "./components/PageTaskPanel.vue";
import { useAppStore } from "./stores/appStore.js";
import { Button, TextField, ThemeToggle, Toast } from "./components/ui";

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
const mobileMenuOpen = ref(false);

watch(
  () => route.name,
  (name) => {
    appStore.setActivePage(typeof name === "string" ? name : "overview");
    mobileMenuOpen.value = false;
  },
  { immediate: true }
);

onMounted(() => appStore.startApp());
onUnmounted(() => appStore.stopApp());

const navItems = [
  { name: "overview", label: "总览", icon: LayoutDashboard, hint: "运行概况" },
  { name: "servers", label: "服务器", icon: Server, hint: "接入与维护" },
  { name: "deploy", label: "部署", icon: Rocket, hint: "Hy2 / Trojan" },
  { name: "nodes", label: "节点", icon: Radio, hint: "状态与监控" },
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
  <div class="min-h-[100dvh]">
    <div class="grain-overlay" aria-hidden="true" />

    <!-- Auth: loading -->
    <div v-if="!auth.checked" class="min-h-[100dvh] grid place-items-center p-6">
      <div class="flex flex-col items-center gap-6 motion-scale-in">
        <div class="relative">
          <div class="absolute inset-0 rounded-[1.4rem] bg-primary/30 blur-xl" aria-hidden="true" />
          <div class="relative grid place-items-center h-14 w-14 rounded-[1.4rem] bg-gradient-to-b from-primary to-[rgb(var(--md-on-primary-container))] text-onPrimary text-xl font-bold specular-ring shadow-elev-3">
            S
          </div>
        </div>
        <p class="type-body-md text-onSurfaceVariant flex items-center gap-2">
          <Loader2 :size="14" class="spin" /> 正在检查登录状态...
        </p>
      </div>
    </div>

    <!-- Auth: login -->
    <div v-else-if="!auth.authenticated" class="min-h-[100dvh] grid place-items-center p-5">
      <!-- Double-bezel login card -->
      <form
        class="w-[min(430px,100%)] rounded-[2.1rem] p-2 bg-[rgb(var(--md-surface-container-high)/0.5)] border border-[rgb(var(--md-outline-variant)/0.7)] dark:border-white/8 shadow-elev-4 motion-scale-in"
        @submit.prevent="login"
      >
        <div class="rounded-[1.75rem] bg-[rgb(var(--md-surface-container-lowest)/0.92)] dark:bg-[rgb(var(--md-surface-container-low)/0.9)] border border-[rgb(var(--md-outline-variant)/0.5)] dark:border-white/6 px-7 py-9 flex flex-col gap-7">
          <div class="flex flex-col items-center text-center gap-4">
            <div class="relative">
              <div class="absolute inset-0 rounded-[1.3rem] bg-primary/30 blur-lg" aria-hidden="true" />
              <div class="relative grid place-items-center h-13 w-13 rounded-[1.3rem] bg-gradient-to-b from-primary to-[rgb(var(--md-on-primary-container))] text-onPrimary text-lg font-bold specular-ring shadow-elev-2">
                S
              </div>
            </div>
            <div>
              <h1 class="type-title-lg text-onSurface">SimpleUI</h1>
              <p class="type-eyebrow text-onSurfaceVariant mt-1.5">Node Console</p>
            </div>
          </div>
          <TextField
            v-model="loginForm.password"
            label="登录密码"
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
            登录控制台
          </Button>
          <div class="flex items-center justify-between pt-1">
            <p class="type-body-sm text-onSurfaceVariant">首次登录使用终端显示的初始密码</p>
            <ThemeToggle />
          </div>
        </div>
      </form>
    </div>

    <!-- App shell -->
    <div v-else class="min-h-[100dvh] grid grid-cols-1 lg:grid-cols-[232px_minmax(0,1fr)]">
      <!-- Floating navigation rail (desktop only; mobile uses the top island bar) -->
      <aside class="hidden lg:flex lg:sticky lg:top-0 lg:h-[100dvh] lg:py-4 lg:pl-4 flex-col z-30">
        <div class="glass-rail rounded-[1.75rem] lg:h-full flex flex-col gap-2 p-2.5 lg:overflow-hidden">
          <!-- Brand -->
          <div class="flex items-center gap-3 px-2.5 pt-2 pb-3">
            <div class="relative shrink-0">
              <div class="absolute inset-0 rounded-[0.95rem] bg-primary/25 blur-md" aria-hidden="true" />
              <div class="relative grid place-items-center h-9.5 w-9.5 rounded-[0.95rem] bg-gradient-to-b from-primary to-[rgb(var(--md-on-primary-container))] text-onPrimary text-sm font-bold specular-ring shadow-elev-1">
                S
              </div>
            </div>
            <div class="min-w-0 hidden sm:block">
              <p class="type-title-sm text-onSurface leading-tight">SimpleUI</p>
              <p class="type-eyebrow text-onSurfaceVariant mt-0.5">Node Console</p>
            </div>
            <!-- Hamburger (mobile) -->
            <button
              type="button"
              class="lg:hidden ml-auto relative h-10 w-10 rounded-full state-layer text-onSurface grid place-items-center focus-ring"
              :aria-expanded="mobileMenuOpen"
              aria-label="导航菜单"
              @click="mobileMenuOpen = !mobileMenuOpen"
            >
              <span class="relative block w-4.5 h-3">
                <span
                  class="absolute left-0 top-0 h-[1.8px] w-full rounded-full bg-current transition-all duration-300 ease-signature"
                  :class="mobileMenuOpen ? 'top-1/2 -translate-y-1/2 rotate-45' : ''"
                />
                <span
                  class="absolute left-0 bottom-0 h-[1.8px] w-full rounded-full bg-current transition-all duration-300 ease-signature"
                  :class="mobileMenuOpen ? 'bottom-1/2 translate-y-1/2 -rotate-45' : ''"
                />
              </span>
            </button>
          </div>

          <!-- Nav -->
          <nav
            class="app-nav hidden lg:flex flex-1 flex-col gap-0.5 overflow-y-auto px-1 py-1"
            aria-label="Primary"
          >
            <RouterLink
              v-for="item in navItems"
              :key="item.name"
              :to="{ name: item.name }"
              :title="item.hint"
              class="press group relative flex items-center gap-3 rounded-2xl px-2.5 py-2 transition-colors duration-250 ease-out-soft focus-ring"
              :class="
                activePage === item.name
                  ? 'bg-[rgb(var(--md-surface-container-high))] text-onSurface shadow-elev-1'
                  : 'text-onSurfaceVariant hover:text-onSurface'
              "
            >
              <span
                v-if="activePage === item.name"
                class="absolute -left-1 top-1/2 -translate-y-1/2 h-4.5 w-[3px] rounded-full bg-primary"
                aria-hidden="true"
              />
              <span
                class="grid place-items-center h-8 w-8 rounded-[10px] transition-colors duration-250 ease-out-soft"
                :class="
                  activePage === item.name
                    ? 'bg-primary text-onPrimary specular-ring'
                    : 'bg-[rgb(var(--md-surface-container-high)/0.55)] text-onSurfaceVariant group-hover:text-onSurface'
                "
              >
                <component :is="item.icon" :size="16" />
              </span>
              <span class="type-label-lg">{{ item.label }}</span>
            </RouterLink>
          </nav>

          <!-- Utility tray: nested inset -->
          <div class="hidden lg:block mx-1 mb-1 rounded-2xl bg-[rgb(var(--md-surface-container-high)/0.45)] border border-[rgb(var(--md-outline-variant)/0.5)] dark:border-white/5 p-2 flex items-center justify-between">
            <ThemeToggle />
            <div class="flex items-center gap-1.5">
              <span class="type-label-sm text-onSurfaceVariant tabular-nums">v{{ appVersion }}</span>
              <button
                type="button"
                class="state-layer press h-8.5 w-8.5 p-2 inline-flex items-center justify-center rounded-full text-onSurfaceVariant hover:text-error transition-colors duration-250 ease-out-soft focus-ring"
                :disabled="authBusy"
                aria-label="退出登录"
                title="退出登录"
                @click="logout"
              >
                <Loader2 v-if="authBusy" :size="15" class="spin" />
                <LogOut v-else :size="15" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      <!-- Main column -->
      <main class="min-w-0 flex flex-col px-4 sm:px-6 lg:px-6 pb-10 lg:pb-14 gap-7 max-w-[1560px] w-full mx-auto">
        <!-- Mobile top bar -->
        <header class="lg:hidden sticky top-3 z-30 mt-3">
          <div class="glass-rail rounded-full pl-3 pr-1.5 py-1.5 flex items-center gap-2.5">
            <div class="grid place-items-center h-8 w-8 rounded-xl bg-gradient-to-b from-primary to-[rgb(var(--md-on-primary-container))] text-onPrimary text-xs font-bold specular-ring">
              S
            </div>
            <span class="type-title-sm text-onSurface">SimpleUI</span>
            <span class="type-label-md text-onSurfaceVariant ml-auto mr-1">{{ pageMeta.title }}</span>
            <button
              type="button"
              class="relative h-9.5 w-9.5 rounded-full state-layer text-onSurface grid place-items-center focus-ring"
              :aria-expanded="mobileMenuOpen"
              aria-label="导航菜单"
              @click="mobileMenuOpen = !mobileMenuOpen"
            >
              <span class="relative block w-4.5 h-3">
                <span
                  class="absolute left-0 top-0 h-[1.8px] w-full rounded-full bg-current transition-all duration-300 ease-signature"
                  :class="mobileMenuOpen ? 'top-1/2 -translate-y-1/2 rotate-45' : ''"
                />
                <span
                  class="absolute left-0 bottom-0 h-[1.8px] w-full rounded-full bg-current transition-all duration-300 ease-signature"
                  :class="mobileMenuOpen ? 'bottom-1/2 translate-y-1/2 -rotate-45' : ''"
                />
              </span>
            </button>
          </div>
        </header>

        <!-- Desktop masthead -->
        <header class="hidden lg:flex items-end justify-between gap-6 pt-9 flex-wrap">
          <div class="min-w-0">
            <div class="type-eyebrow text-onSurfaceVariant/80 mb-2 flex items-center gap-2">
              <span>SimpleUI</span>
              <span class="inline-block h-2.5 w-px bg-[rgb(var(--md-outline-variant))]" aria-hidden="true" />
              <span class="text-primary">{{ pageMeta.title }}</span>
            </div>
            <h1 class="type-headline-lg text-onSurface break-words">{{ pageMeta.title }}</h1>
            <p class="type-body-md text-onSurfaceVariant mt-1.5 max-w-2xl break-words">
              {{ pageMeta.description }}
            </p>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <Button
              variant="soft"
              size="md"
              :loading="loading"
              @click="syncNow"
            >
              <template #leading>
                <RefreshCw :size="15" />
              </template>
              同步数据
            </Button>
          </div>
        </header>

        <IpQualityReportModal />
        <BanNodeModal />
        <ManualNodeModal />
        <PageTaskPanel />

        <div class="flex-1 min-w-0">
          <RouterView v-slot="{ Component, route: r }">
            <!-- Explicit timers, not transitionend: a viewport resize during the
                 swap must never freeze the outgoing page. -->
            <Transition
              mode="out-in"
              :duration="{ enter: 340, leave: 150 }"
              enter-active-class="transition-all duration-400 ease-out-soft"
              enter-from-class="opacity-0 translate-y-3"
              leave-active-class="transition-all duration-180 ease-emphasized-accel"
              leave-to-class="opacity-0 -translate-y-1.5"
            >
              <component :is="Component" :key="r.fullPath" />
            </Transition>
          </RouterView>
        </div>
      </main>
    </div>

    <!-- Mobile full-screen nav overlay -->
    <Teleport to="body">
      <Transition
        enter-active-class="transition-opacity duration-300 ease-out-soft"
        enter-from-class="opacity-0"
        leave-active-class="transition-opacity duration-250 ease-emphasized-accel"
        leave-to-class="opacity-0"
      >
        <div
          v-if="mobileMenuOpen && auth.authenticated"
          class="lg:hidden fixed inset-0 z-50 flex flex-col bg-[rgb(var(--md-surface)/0.86)] dark:bg-[rgb(var(--md-surface)/0.9)] backdrop-blur-2xl"
          role="dialog"
          aria-modal="true"
          aria-label="导航"
        >
          <div class="flex items-center justify-between px-6 pt-7">
            <div class="flex items-center gap-3">
              <div class="grid place-items-center h-9.5 w-9.5 rounded-[0.95rem] bg-gradient-to-b from-primary to-[rgb(var(--md-on-primary-container))] text-onPrimary text-sm font-bold specular-ring">
                S
              </div>
              <div>
                <p class="type-title-sm text-onSurface">SimpleUI</p>
                <p class="type-eyebrow text-onSurfaceVariant">Node Console</p>
              </div>
            </div>
            <button
              type="button"
              class="h-11 w-11 rounded-full state-layer text-onSurface grid place-items-center focus-ring"
              aria-label="关闭菜单"
              @click="mobileMenuOpen = false"
            >
              <X :size="20" />
            </button>
          </div>

          <nav class="flex-1 overflow-y-auto px-8 pt-10 pb-8 flex flex-col gap-1" aria-label="Mobile">
            <RouterLink
              v-for="(item, i) in navItems"
              :key="item.name"
              :to="{ name: item.name }"
              class="press group flex items-center gap-4 rounded-2xl px-4 py-3.5 transition-all duration-500 ease-out-soft"
              :class="[
                activePage === item.name
                  ? 'bg-[rgb(var(--md-surface-container-high))] text-onSurface'
                  : 'text-onSurfaceVariant',
                mobileMenuOpen ? 'translate-y-0 opacity-100' : 'translate-y-5 opacity-0'
              ]"
              :style="{ transitionDelay: mobileMenuOpen ? `${90 + i * 45}ms` : '0ms' }"
            >
              <span
                class="grid place-items-center h-10 w-10 rounded-xl"
                :class="activePage === item.name ? 'bg-primary text-onPrimary specular-ring' : 'bg-[rgb(var(--md-surface-container-high))] text-onSurfaceVariant'"
              >
                <component :is="item.icon" :size="18" />
              </span>
              <span class="type-title-md">{{ item.label }}</span>
              <span class="type-body-sm text-onSurfaceVariant/70 ml-auto">{{ item.hint }}</span>
            </RouterLink>
          </nav>

          <div class="px-8 pb-10 flex items-center justify-between">
            <ThemeToggle />
            <button
              type="button"
              class="state-layer press inline-flex items-center gap-2 rounded-full px-4 py-2.5 type-label-lg text-error focus-ring"
              :disabled="authBusy"
              @click="logout"
            >
              <LogOut :size="15" />
              退出登录
            </button>
          </div>
        </div>
      </Transition>
    </Teleport>

    <Toast :show="toastVisible" :message="toast" variant="error" @dismiss="dismissToast" />
  </div>
</template>
