<script setup>
import { onMounted, onUnmounted, toRef, watch } from "vue";
import { RouterLink, RouterView, useRoute } from "vue-router";
import BanNodeModal from "./components/BanNodeModal.vue";
import IpQualityReportModal from "./components/IpQualityReportModal.vue";
import ManualNodeModal from "./components/ManualNodeModal.vue";
import PageTaskPanel from "./components/PageTaskPanel.vue";
import { useAppStore } from "./stores/appStore.js";

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

watch(
  () => route.name,
  (name) => appStore.setActivePage(typeof name === "string" ? name : "overview"),
  { immediate: true }
);

onMounted(() => appStore.startApp());
onUnmounted(() => appStore.stopApp());
</script>

<template>
  <div v-if="!auth.checked" class="auth-shell">
    <section class="auth-panel">
      <div class="auth-mark">S</div>
      <h1>SimpleUI</h1>
      <p>正在检查登录状态...</p>
    </section>
  </div>

  <div v-else-if="!auth.authenticated" class="auth-shell">
    <form class="auth-panel" @submit.prevent="login">
      <div class="auth-mark">S</div>
      <h1>SimpleUI</h1>
      <p>输入首次启动时在 CLI 输出的 UUID 初始密码。</p>
      <p v-if="toast" class="auth-error">{{ toast }}</p>
      <label>
        <span>WebUI 密码</span>
        <input v-model="loginForm.password" type="password" autocomplete="current-password" autofocus required />
      </label>
      <button class="primary-button" type="submit" :disabled="authBusy || !loginForm.password">
        <Loader2 v-if="authBusy" class="spin" :size="16" />
        <ShieldCheck v-else :size="16" />
        登录
      </button>
    </form>
  </div>

  <div v-else class="app">
    <aside class="sidebar">
      <div class="brand">
        <strong>SimpleUI</strong>
        <span>Persistent Hooks</span>
      </div>
      <nav>
        <RouterLink :to="{ name: 'overview' }" :class="{ active: activePage === 'overview' }"><Gauge :size="17" />概览</RouterLink>
        <RouterLink :to="{ name: 'servers' }" :class="{ active: activePage === 'servers' }"><Server :size="17" />服务器</RouterLink>
        <RouterLink :to="{ name: 'deploy' }" :class="{ active: activePage === 'deploy' }"><CloudLightning :size="17" />部署</RouterLink>
        <RouterLink :to="{ name: 'nodes' }" :class="{ active: activePage === 'nodes' }"><Wifi :size="17" />节点</RouterLink>
        <RouterLink :to="{ name: 'connections' }" :class="{ active: activePage === 'connections' }"><Ban :size="17" />连接封禁</RouterLink>
        <RouterLink :to="{ name: 'tools' }" :class="{ active: activePage === 'tools' }"><Gauge :size="17" />工具</RouterLink>
        <RouterLink :to="{ name: 'terminal' }" :class="{ active: activePage === 'terminal' }"><Terminal :size="17" />终端</RouterLink>
        <RouterLink :to="{ name: 'logs' }" :class="{ active: activePage === 'logs' }"><Terminal :size="17" />日志</RouterLink>
        <RouterLink :to="{ name: 'about' }" :class="{ active: activePage === 'about' }"><Info :size="17" />关于</RouterLink>
      </nav>
    </aside>

    <main>
      <header class="topbar">
        <div>
          <h1>{{ pageMeta.title }}</h1>
          <p>{{ pageMeta.description }}</p>
        </div>
        <div class="topbar-actions">
          <button type="button" @click="syncNow" :disabled="loading">
            <Loader2 v-if="loading" class="spin" :size="16" />
            <RefreshCcw v-else :size="16" />
            同步
          </button>
          <button type="button" @click="logout" :disabled="authBusy">
            <X :size="16" />
            退出
          </button>
        </div>
      </header>

      <div v-if="toast" class="toast" @click="toast = ''">
        <CircleAlert :size="16" />
        {{ toast }}
      </div>

      <IpQualityReportModal />
      <BanNodeModal />
      <ManualNodeModal />
      <PageTaskPanel />
      <RouterView />
    </main>
  </div>
</template>
