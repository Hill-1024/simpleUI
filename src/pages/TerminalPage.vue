<script setup>
import { computed } from "vue";
import {
  Terminal,
  Eraser,
  Loader2
} from "lucide-vue-next";
import {
  Surface,
  Button,
  Chip,
  Select,
  TextField
} from "../components/ui";
import { useAppBindings } from "../composables/useAppBindings.js";

const {
  terminalServerId,
  activeTerminalSession,
  readyServers,
  serverName,
  terminalSessionRunning,
  terminalPrompt,
  terminalOutputRef,
  terminalCommandInputRef,
  runTerminalCommand,
  clearTerminal,
  focusTerminalInput
} = useAppBindings();

const running = computed(() => terminalSessionRunning(activeTerminalSession.value));
const promptText = computed(() => terminalPrompt(activeTerminalSession.value));

const stateLabel = computed(() => running.value ? "running" : "ready");
const stateColor = computed(() => running.value ? "primary" : "neutral");
</script>

<template>
  <Surface v-reveal variant="panel" radius="2xl" padding="lg" class="flex flex-col gap-6">
    <header class="flex items-center justify-between gap-3 flex-wrap">
      <div class="flex items-center gap-2.5">
        <span class="grid place-items-center h-8 w-8 rounded-[10px] bg-primary/10 text-primary">
          <Terminal :size="15" />
        </span>
        <h2 class="type-title-lg text-onSurface">服务器终端</h2>
      </div>
      <Chip :color="stateColor" variant="tonal" size="sm" dot>
        {{ activeTerminalSession.job?.status || stateLabel }}
      </Chip>
    </header>

    <div class="grid gap-3.5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-[2fr_1.5fr_1fr_auto] items-end">
      <Select v-model="terminalServerId" label="目标服务器" required>
        <option value="" disabled>选择服务器</option>
        <option v-for="server in readyServers" :key="server.id" :value="server.id">
          {{ server.name }}
        </option>
      </Select>
      <TextField
        v-model="activeTerminalSession.cwd"
        label="工作目录"
        placeholder="/root"
        :disabled="!terminalServerId"
      />
      <TextField
        v-model.number="activeTerminalSession.timeoutSeconds"
        label="超时（秒）"
        type="number"
        :disabled="!terminalServerId"
        :min="1"
        :max="3600"
      />
      <Button
        variant="soft"
        size="md"
        :disabled="!terminalServerId"
        @click="clearTerminal"
      >
        <template #leading>
          <Eraser :size="14" />
        </template>
        清屏
      </Button>
    </div>

    <!-- Machined console: bezel shell + always-dark core -->
    <div
      class="rounded-[1.4rem] p-1.5 bg-[rgb(var(--md-surface-container-high)/0.5)] border border-[rgb(var(--md-outline-variant)/0.6)] dark:border-white/8 shadow-elev-2"
      @click="focusTerminalInput"
    >
      <div class="console-surface rounded-[1.1rem] overflow-hidden border border-black/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        <header class="flex items-center justify-between px-4 py-2.5 bg-white/4 border-b border-white/8">
          <div class="flex items-center gap-2.5">
            <div class="flex gap-1.5">
              <span class="h-2.5 w-2.5 rounded-full bg-[#FF5F57]/90" />
              <span class="h-2.5 w-2.5 rounded-full bg-[#FEBC2E]/90" />
              <span class="h-2.5 w-2.5 rounded-full bg-[#28C840]/90" />
            </div>
            <span class="type-label-md text-[#B7C9C2] ml-1.5">
              {{ terminalServerId ? `${serverName(terminalServerId)} 终端` : "服务器终端" }}
            </span>
          </div>
          <span
            class="type-label-sm px-2.5 py-0.5 rounded-full border tabular-nums"
            :class="running ? 'text-[#4ADCB0] border-[#4ADCB0]/40' : 'text-[#8FA39C] border-white/12'"
          >
            {{ stateLabel }}
          </span>
        </header>
        <pre
          ref="terminalOutputRef"
          class="px-4 py-3.5 min-h-[300px] max-h-[60vh] overflow-auto font-mono type-body-sm leading-relaxed whitespace-pre-wrap"
        >{{ activeTerminalSession.output || "在下方提示符输入命令并按 Enter。" }}</pre>
        <form
          class="terminal-input-line flex items-center gap-2.5 px-4 py-2.5 border-t border-white/8 bg-white/4"
          @submit.prevent="runTerminalCommand"
        >
          <span class="terminal-prompt font-mono type-body-sm text-[#4ADCB0] shrink-0">{{ promptText }}</span>
          <input
            ref="terminalCommandInputRef"
            v-model="activeTerminalSession.command"
            autocomplete="off"
            spellcheck="false"
            :disabled="!terminalServerId || running"
            class="flex-1 bg-transparent outline-none border-none font-mono type-body-sm text-[#E8F0ED] placeholder-[#5E7069]"
            @keydown.enter.exact.prevent="runTerminalCommand"
          />
          <Loader2 v-if="running" :size="14" class="spin text-[#4ADCB0] shrink-0" />
        </form>
      </div>
    </div>
  </Surface>
</template>
