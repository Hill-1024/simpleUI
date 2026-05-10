import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import { registerIcons } from "./icons.js";
import { normalizeLegacyHash, router } from "./router.js";
import "./styles.css";

normalizeLegacyHash();

const app = createApp(App);
app.use(createPinia());
app.use(router);
registerIcons(app);
app.mount("#root");
