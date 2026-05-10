<template>
<section id="terminal" class="panel terminal-page">
        <div class="section-title">
          <div><Terminal :size="18" /><h2>服务器终端</h2></div>
          <div class="job-state">{{ activeTerminalSession.job?.status || "idle" }}</div>
        </div>
        <div class="terminal-controls">
          <label>
            <span>目标服务器</span>
            <select v-model="terminalServerId" required>
              <option value="" disabled>选择 hook 已就绪的服务器</option>
              <option v-for="server in readyServers" :key="server.id" :value="server.id">{{ server.name }}</option>
            </select>
          </label>
          <label>
            <span>工作目录</span>
            <input v-model="activeTerminalSession.cwd" placeholder="/root" :disabled="!terminalServerId" />
          </label>
          <label>
            <span>超时秒数</span>
            <input v-model.number="activeTerminalSession.timeoutSeconds" type="number" min="1" max="3600" :disabled="!terminalServerId" />
          </label>
          <div class="terminal-actions">
            <button class="secondary-button" type="button" :disabled="!terminalServerId" @click="clearTerminal">
              <Eraser :size="15" />
              清屏
            </button>
          </div>
        </div>
        <div class="terminal-shell" @click="focusTerminalInput">
          <div class="terminal-shell-head">
            <span>{{ terminalServerId ? `${serverName(terminalServerId)} Terminal` : "Hook Terminal" }}</span>
            <small>{{ terminalSessionRunning(activeTerminalSession) ? "running" : "ready" }}</small>
          </div>
          <pre ref="terminalOutputRef" class="terminal-output">{{ activeTerminalSession.output || "在下方提示符输入命令并按 Enter。" }}</pre>
          <form class="terminal-input-line" @submit.prevent="runTerminalCommand">
            <span class="terminal-prompt">{{ terminalPrompt(activeTerminalSession) }}</span>
            <input
              ref="terminalCommandInputRef"
              v-model="activeTerminalSession.command"
              autocomplete="off"
              spellcheck="false"
              :disabled="!terminalServerId || terminalSessionRunning(activeTerminalSession)"
              @keydown.enter.exact.prevent="runTerminalCommand"
            />
            <Loader2 v-if="terminalSessionRunning(activeTerminalSession)" class="spin terminal-running-icon" :size="15" />
          </form>
        </div>
      </section>
</template>

<script>
import { useAppBindings } from "../composables/useAppBindings.js";

export default {
  name: "TerminalPage",
  setup() {
    return useAppBindings();
  }
};
</script>
