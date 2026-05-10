<template>
<section id="logs" class="panel">
        <div class="section-title">
          <div><Terminal :size="18" /><h2>任务日志</h2></div>
          <div class="job-state">{{ activeJob?.status || "idle" }}</div>
        </div>
        <div class="console">
          <div class="console-head"><Terminal :size="16" /><span>{{ activeJob ? activeJob.title : "Hook 输出" }}</span></div>
          <pre>{{ jobLogs.length ? jobLogs.join("") : "等待服务器 hook 安装、节点部署、状态刷新或封禁任务..." }}</pre>
        </div>
      </section>
</template>

<script>
import { useAppBindings } from "../composables/useAppBindings.js";

export default {
  name: "LogsPage",
  setup() {
    return useAppBindings();
  }
};
</script>
