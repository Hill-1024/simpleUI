import {
  defineConfig,
  presetUno,
  presetAttributify,
  transformerVariantGroup
} from "unocss";

export default defineConfig({
  presets: [
    presetUno(),
    presetAttributify()
  ],
  transformers: [transformerVariantGroup()],
  theme: {
    colors: {
      primary: "rgb(var(--md-primary) / <alpha-value>)",
      onPrimary: "rgb(var(--md-on-primary) / <alpha-value>)",
      primaryContainer: "rgb(var(--md-primary-container) / <alpha-value>)",
      onPrimaryContainer: "rgb(var(--md-on-primary-container) / <alpha-value>)",
      secondary: "rgb(var(--md-secondary) / <alpha-value>)",
      onSecondary: "rgb(var(--md-on-secondary) / <alpha-value>)",
      secondaryContainer: "rgb(var(--md-secondary-container) / <alpha-value>)",
      onSecondaryContainer: "rgb(var(--md-on-secondary-container) / <alpha-value>)",
      tertiary: "rgb(var(--md-tertiary) / <alpha-value>)",
      onTertiary: "rgb(var(--md-on-tertiary) / <alpha-value>)",
      tertiaryContainer: "rgb(var(--md-tertiary-container) / <alpha-value>)",
      onTertiaryContainer: "rgb(var(--md-on-tertiary-container) / <alpha-value>)",
      error: "rgb(var(--md-error) / <alpha-value>)",
      onError: "rgb(var(--md-on-error) / <alpha-value>)",
      errorContainer: "rgb(var(--md-error-container) / <alpha-value>)",
      onErrorContainer: "rgb(var(--md-on-error-container) / <alpha-value>)",
      warning: "rgb(var(--md-warning) / <alpha-value>)",
      onWarning: "rgb(var(--md-on-warning) / <alpha-value>)",
      warningContainer: "rgb(var(--md-warning-container) / <alpha-value>)",
      onWarningContainer: "rgb(var(--md-on-warning-container) / <alpha-value>)",
      success: "rgb(var(--md-success) / <alpha-value>)",
      onSuccess: "rgb(var(--md-on-success) / <alpha-value>)",
      successContainer: "rgb(var(--md-success-container) / <alpha-value>)",
      onSuccessContainer: "rgb(var(--md-on-success-container) / <alpha-value>)",
      surface: "rgb(var(--md-surface) / <alpha-value>)",
      surfaceDim: "rgb(var(--md-surface-dim) / <alpha-value>)",
      surfaceBright: "rgb(var(--md-surface-bright) / <alpha-value>)",
      surfaceContainer: "rgb(var(--md-surface-container) / <alpha-value>)",
      surfaceContainerLow: "rgb(var(--md-surface-container-low) / <alpha-value>)",
      surfaceContainerLowest: "rgb(var(--md-surface-container-lowest) / <alpha-value>)",
      surfaceContainerHigh: "rgb(var(--md-surface-container-high) / <alpha-value>)",
      surfaceContainerHighest: "rgb(var(--md-surface-container-highest) / <alpha-value>)",
      onSurface: "rgb(var(--md-on-surface) / <alpha-value>)",
      onSurfaceVariant: "rgb(var(--md-on-surface-variant) / <alpha-value>)",
      outline: "rgb(var(--md-outline) / <alpha-value>)",
      outlineVariant: "rgb(var(--md-outline-variant) / <alpha-value>)",
      scrim: "rgb(var(--md-scrim) / <alpha-value>)",
      shadow: "rgb(var(--md-shadow) / <alpha-value>)"
    },
    fontFamily: {
      sans: '"Plus Jakarta Sans Variable", "PingFang SC", "HarmonyOS Sans SC", "Source Han Sans SC", "Noto Sans CJK SC", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
      mono: '"JetBrains Mono Variable", ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace'
    },
    borderRadius: {
      xs: "6px",
      sm: "10px",
      md: "14px",
      lg: "18px",
      xl: "22px",
      "2xl": "28px",
      "3xl": "36px",
      full: "9999px"
    },
    boxShadow: {
      "elev-1": "var(--md-shadow-elev-1)",
      "elev-2": "var(--md-shadow-elev-2)",
      "elev-3": "var(--md-shadow-elev-3)",
      "elev-4": "var(--md-shadow-elev-4)",
      "elev-5": "var(--md-shadow-elev-5)",
      glass: "var(--md-shadow-glass)",
      "glass-strong": "var(--md-shadow-glass-strong)"
    },
    transitionTimingFunction: {
      signature: "cubic-bezier(0.32, 0.72, 0, 1)",
      "out-soft": "cubic-bezier(0.22, 1, 0.36, 1)",
      spring: "cubic-bezier(0.34, 1.28, 0.48, 1)",
      standard: "cubic-bezier(0.32, 0.72, 0, 1)",
      emphasized: "cubic-bezier(0.32, 0.72, 0, 1)",
      "emphasized-decel": "cubic-bezier(0.22, 1, 0.36, 1)",
      "emphasized-accel": "cubic-bezier(0.4, 0, 1, 0.6)"
    }
  },
  shortcuts: {
    /* Surfaces: solid, calm, hairline-separated. No blur on scrolling content. */
    "glass-base":
      "relative isolate border border-[rgb(var(--md-outline-variant)/0.65)] dark:border-white/8",
    "glass-panel":
      "glass-base bg-[rgb(var(--md-surface-container-lowest)/var(--glass-alpha-panel))] dark:bg-[rgb(var(--md-surface-container)/var(--glass-alpha-panel))] shadow-elev-2",
    "glass-elevated":
      "glass-base bg-[rgb(var(--md-surface-container-lowest)/var(--glass-alpha-elevated))] dark:bg-[rgb(var(--md-surface-container-low)/var(--glass-alpha-elevated))] shadow-elev-4",
    "glass-soft":
      "glass-base bg-[rgb(var(--md-surface-container-high)/var(--glass-alpha-soft))] shadow-none",
    "glass-rail":
      "glass-base bg-[rgb(var(--md-surface-container-lowest)/var(--glass-alpha-rail))] dark:bg-[rgb(var(--md-surface-container-low)/var(--glass-alpha-rail))] shadow-elev-3",
    /* Machined inner highlight for primary actions and brand marks. */
    "specular-top":
      "before:content-[''] before:absolute before:inset-x-3 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white/50 before:to-transparent before:pointer-events-none dark:before:via-white/25",
    "specular-ring":
      "after:content-[''] after:absolute after:inset-0 after:rounded-[inherit] after:pointer-events-none after:[box-shadow:inset_0_1px_0_rgb(255_255_255/0.4),inset_0_-1px_0_rgb(0_0_0/0.06)] dark:after:[box-shadow:inset_0_1px_0_rgb(255_255_255/0.1),inset_0_-1px_0_rgb(0_0_0/0.24)]",
    "focus-ring":
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[rgb(var(--md-surface))]",
    /* Physical press feedback. */
    press: "transition-transform duration-200 ease-[cubic-bezier(0.34,1.28,0.48,1)] active:scale-[0.97]",
    "type-display-lg": "text-[56px] leading-[64px] tracking-[-0.02em] font-semibold",
    "type-display-md": "text-[44px] leading-[52px] tracking-[-0.02em] font-semibold",
    "type-display-sm": "text-[34px] leading-[42px] tracking-[-0.015em] font-semibold",
    "type-headline-lg": "text-[30px] leading-[40px] tracking-[-0.015em] font-semibold",
    "type-headline-md": "text-[26px] leading-[36px] tracking-[-0.015em] font-semibold",
    "type-headline-sm": "text-[22px] leading-[30px] tracking-[-0.01em] font-semibold",
    "type-title-lg": "text-[20px] leading-[28px] tracking-[-0.01em] font-semibold",
    "type-title-md": "text-[16px] leading-[24px] tracking-normal font-semibold",
    "type-title-sm": "text-[14px] leading-[20px] tracking-normal font-semibold",
    "type-body-lg": "text-[16px] leading-[26px] tracking-normal",
    "type-body-md": "text-[14px] leading-[22px] tracking-normal",
    "type-body-sm": "text-[12.5px] leading-[19px] tracking-normal",
    "type-label-lg": "text-[14px] leading-[20px] font-medium tracking-normal",
    "type-label-md": "text-[12.5px] leading-[18px] font-medium tracking-normal",
    "type-label-sm": "text-[11px] leading-[16px] font-medium tracking-[0.01em]",
    "type-eyebrow": "text-[10.5px] leading-[16px] font-semibold uppercase tracking-[0.18em]"
  },
  safelist: ["animate-spin"],
  content: {
    pipeline: {
      include: [/\.(vue|js|ts|html)($|\?)/]
    }
  }
});
