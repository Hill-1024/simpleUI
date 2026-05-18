import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import { registerIcons } from "./icons.js";
import { normalizeLegacyHash, router } from "./router.js";
import { initTheme } from "./composables/useTheme.js";
import "virtual:uno.css";
import "./design/tokens.css";
import "./design/base.css";

initTheme();
normalizeLegacyHash();

const app = createApp(App);
app.use(createPinia());
app.use(router);
registerIcons(app);
app.mount("#root");
