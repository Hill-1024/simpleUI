import { createRouter, createWebHashHistory } from "vue-router";
import OverviewPage from "./pages/OverviewPage.vue";
import ServersPage from "./pages/ServersPage.vue";
import DeployPage from "./pages/DeployPage.vue";
import NodesPage from "./pages/NodesPage.vue";
import ConnectionsPage from "./pages/ConnectionsPage.vue";
import ToolsPage from "./pages/ToolsPage.vue";
import TerminalPage from "./pages/TerminalPage.vue";
import LogsPage from "./pages/LogsPage.vue";
import AboutPage from "./pages/AboutPage.vue";

export const pageRoutes = [
  { path: "/overview", name: "overview", component: OverviewPage },
  { path: "/servers", name: "servers", component: ServersPage },
  { path: "/deploy", name: "deploy", component: DeployPage },
  { path: "/nodes", name: "nodes", component: NodesPage },
  { path: "/connections", name: "connections", component: ConnectionsPage },
  { path: "/tools", name: "tools", component: ToolsPage },
  { path: "/terminal", name: "terminal", component: TerminalPage },
  { path: "/logs", name: "logs", component: LogsPage },
  { path: "/about", name: "about", component: AboutPage }
];

export function normalizeLegacyHash() {
  if (typeof window === "undefined") return;
  const hash = window.location.hash || "";
  if (!/^#[^/!]/.test(hash)) return;
  const page = hash.slice(1).split(/[?&]/)[0] || "overview";
  window.location.replace(`${window.location.pathname}${window.location.search}#/${page}`);
}

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: "/", redirect: "/overview" },
    ...pageRoutes,
    { path: "/:pathMatch(.*)*", redirect: "/overview" }
  ]
});
