<template>
<section v-if="activePageTaskFeedback && activePageTaskCards.length" class="panel page-task-panel">
        <div class="page-task-title">
          <div>
            <Terminal :size="17" />
            <h3>{{ activePageTaskFeedback.title }}</h3>
          </div>
          <div class="page-task-actions">
            <span class="task-count">{{ statusLabel(activePageTask.status) }}</span>
            <button type="button" title="清除反馈" @click="clearPageTaskFeedback()"><X :size="15" /></button>
          </div>
        </div>
        <div class="page-task-list">
          <article v-for="job in activePageTaskCards" :key="job.id" class="page-task-item">
            <div class="page-task-main">
              <div class="task-main">
                <Loader2 v-if="['queued', 'running'].includes(job.status)" class="spin" :size="16" />
                <CircleAlert v-else-if="job.status === 'failed'" :size="16" />
                <ShieldCheck v-else :size="16" />
                <div>
                  <strong>{{ job.title }}</strong>
                  <small>{{ jobKindLabel(job.type) }} · {{ jobTime(job) }}</small>
                </div>
              </div>
              <span :class="`pill status-${job.status || 'unknown'}`">{{ statusLabel(job.status) }}</span>
            </div>
            <p>{{ jobSummary(job) }}</p>
            <details v-if="taskHasLogs(job)" class="page-task-log" :open="['running', 'failed'].includes(job.status)">
              <summary>Hook 输出</summary>
              <pre>{{ taskLogText(job) }}</pre>
            </details>
          </article>
        </div>
      </section>
</template>

<script>
import { useAppBindings } from "../composables/useAppBindings.js";

export default {
  name: "PageTaskPanel",
  setup() {
    return useAppBindings();
  }
};
</script>
