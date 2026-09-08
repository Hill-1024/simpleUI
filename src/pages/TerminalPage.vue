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
  <Surface variant="panel" radius="2xl" padding="lg" class="flex flex-col gap-5">
    <header class="flex items-center justify-between gap-3 flex-wrap">
      <div class="flex items-center gap-2">
        <Terminal :size="18" class="text-primary" />
        <h2 class="type-title-lg text-onSurface">服务器终端</h2>
      </div>
      <Chip :color="stateColor" variant="tonal" size="sm" dot>
        {{ activeTerminalSession.job?.status || stateLabel }}
      </Chip>
    </header>

    <div class="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-[2fr_2fr_1fr_auto] items-end">
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
        variant="tonal"
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

    <div
      class="rounded-2xl overflow-hidden bg-surfaceContainerLowest border border-outlineVariant/30 shadow-elev-1"
      @click="focusTerminalInput"
    >
      <header class="flex items-center justify-between px-4 py-2.5 bg-surfaceContainerLow/60 border-b border-outlineVariant/30">
        <div class="flex items-center gap-2">
          <div class="flex gap-1.5">
            <span class="h-2.5 w-2.5 rounded-full bg-error/80" />
            <span class="h-2.5 w-2.5 rounded-full bg-warning/80" />
            <span class="h-2.5 w-2.5 rounded-full bg-success/80" />
          </div>
          <span class="type-label-md text-onSurface ml-2">
            {{ terminalServerId ? `${serverName(terminalServerId)} 终端` : "服务器终端" }}
          </span>
        </div>
        <Chip :color="stateColor" variant="outlined" size="xs">{{ stateLabel }}</Chip>
      </header>
      <pre
        ref="terminalOutputRef"
        class="terminal-output px-4 py-3 min-h-[300px] max-h-[60vh] overflow-auto font-mono type-body-sm leading-relaxed text-onSurface whitespace-pre-wrap"
      >{{ activeTerminalSession.output || "在下方提示符输入命令并按 Enter。" }}</pre>
      <form
        class="terminal-input-line flex items-center gap-2 px-4 py-2.5 border-t border-outlineVariant/30 bg-surfaceContainerLow/40"
        @submit.prevent="runTerminalCommand"
      >
        <span class="terminal-prompt font-mono type-body-sm text-primary shrink-0">{{ promptText }}</span>
        <input
          ref="terminalCommandInputRef"
          v-model="activeTerminalSession.command"
          autocomplete="off"
          spellcheck="false"
          :disabled="!terminalServerId || running"
          class="flex-1 bg-transparent outline-none border-none font-mono type-body-sm text-onSurface placeholder-onSurfaceVariant/60"
          @keydown.enter.exact.prevent="runTerminalCommand"
        />
        <Loader2 v-if="running" :size="14" class="spin text-primary shrink-0" />
      </form>
    </div>
  </Surface>
</template>
