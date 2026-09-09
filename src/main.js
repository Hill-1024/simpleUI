import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import { registerIcons } from "./icons.js";
import { normalizeLegacyHash, router } from "./router.js";
import { initTheme } from "./composables/useTheme.js";
import "@fontsource-variable/plus-jakarta-sans";
import "@fontsource-variable/jetbrains-mono";
import "virtual:uno.css";
import "./design/tokens.css";
import "./design/base.css";

initTheme();
normalizeLegacyHash();

/* Scroll-reveal: one shared observer, transform/opacity/filter only. */
const revealObserver =
  typeof IntersectionObserver !== "undefined"
    ? new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              entry.target.classList.add("is-revealed");
              revealObserver.unobserve(entry.target);
            }
          }
        },
        { rootMargin: "0px 0px -8% 0px", threshold: 0.05 }
      )
    : null;

const app = createApp(App);
app.use(createPinia());
app.use(router);
registerIcons(app);

app.directive("reveal", {
  mounted(el, binding) {
    if (!revealObserver) return;
    el.classList.add("reveal");
    if (binding.value) el.style.transitionDelay = `${Number(binding.value) || 0}ms`;
    revealObserver.observe(el);
  },
  unmounted(el) {
    revealObserver?.unobserve(el);
  }
});

app.mount("#root");
