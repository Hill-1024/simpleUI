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
      sans: 'Inter, "PingFang SC", "HarmonyOS Sans SC", "Source Han Sans SC", "Noto Sans CJK SC", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
      mono: '"JetBrains Mono", ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace'
    },
    borderRadius: {
      xs: "4px",
      sm: "8px",
      md: "12px",
      lg: "16px",
      xl: "20px",
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
      standard: "cubic-bezier(0.2, 0, 0, 1)",
      emphasized: "cubic-bezier(0.3, 0, 0, 1)",
      "emphasized-decel": "cubic-bezier(0.05, 0.7, 0.1, 1)",
      "emphasized-accel": "cubic-bezier(0.3, 0, 0.8, 0.15)"
    }
  },
  shortcuts: {
    "glass-base":
      "relative isolate backdrop-blur-xl backdrop-saturate-150 border border-white/10 dark:border-white/8",
    "glass-panel":
      "glass-base bg-[rgb(var(--md-surface-container)/var(--glass-alpha-panel))] shadow-glass",
    "glass-elevated":
      "glass-base bg-[rgb(var(--md-surface-container-high)/var(--glass-alpha-elevated))] shadow-glass-strong",
    "glass-soft":
      "glass-base bg-[rgb(var(--md-surface-container-low)/var(--glass-alpha-soft))]",
    "glass-rail":
      "glass-base bg-[rgb(var(--md-surface-container-low)/var(--glass-alpha-rail))] shadow-glass",
    "specular-top":
      "before:content-[''] before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white/40 before:to-transparent before:pointer-events-none dark:before:via-white/20",
    "specular-ring":
      "after:content-[''] after:absolute after:inset-0 after:rounded-[inherit] after:pointer-events-none after:[box-shadow:inset_0_1px_0_rgb(255_255_255/0.35),inset_0_-1px_0_rgb(0_0_0/0.05)] dark:after:[box-shadow:inset_0_1px_0_rgb(255_255_255/0.12),inset_0_-1px_0_rgb(0_0_0/0.2)]",
    "focus-ring":
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[rgb(var(--md-surface))]",
    "state-layer":
      "relative before:content-[''] before:absolute before:inset-0 before:rounded-[inherit] before:opacity-0 before:transition-opacity before:duration-150 before:bg-current hover:before:opacity-8 active:before:opacity-12 before:pointer-events-none",
    "type-display-lg": "text-[57px] leading-[68px] tracking-normal font-light",
    "type-display-md": "text-[45px] leading-[56px] tracking-normal font-light",
    "type-display-sm": "text-[36px] leading-[46px] tracking-normal font-light",
    "type-headline-lg": "text-[32px] leading-[44px] tracking-normal font-medium",
    "type-headline-md": "text-[28px] leading-[38px] tracking-normal font-medium",
    "type-headline-sm": "text-[24px] leading-[34px] tracking-normal font-medium",
    "type-title-lg": "text-[22px] leading-[30px] tracking-normal font-medium",
    "type-title-md": "text-[16px] leading-[26px] tracking-normal font-semibold",
    "type-title-sm": "text-[14px] leading-[22px] tracking-normal font-semibold",
    "type-body-lg": "text-[16px] leading-[26px] tracking-normal",
    "type-body-md": "text-[14px] leading-[22px] tracking-normal",
    "type-body-sm": "text-[12px] leading-[18px] tracking-normal",
    "type-label-lg": "text-[14px] leading-[22px] font-medium tracking-normal",
    "type-label-md": "text-[12px] leading-[18px] font-medium tracking-normal",
    "type-label-sm": "text-[11px] leading-[16px] font-medium tracking-normal"
  },
  safelist: ["animate-spin"],
  content: {
    pipeline: {
      include: [/\.(vue|js|ts|html)($|\?)/]
    }
  }
});
