<template>
<section class="about-page">
        <section class="about-hero panel">
          <div class="about-mark">S</div>
          <div>
            <h2>{{ projectInfo.name }}</h2>
            <p>多服务器 Hysteria2 / Trojan 节点控制台，面向持久化 Hook、快速部署、连接观测与跨节点封禁。</p>
          </div>
        </section>
        <div class="about-grid">
          <section class="panel about-card">
            <div class="section-title">
              <div><Info :size="18" /><h2>项目信息</h2></div>
            </div>
            <dl class="info-list">
              <div><dt>作者</dt><dd>{{ projectInfo.author }}</dd></div>
              <div><dt>当前版本</dt><dd>{{ projectInfo.version }}</dd></div>
              <div><dt>发布日期</dt><dd>{{ projectInfo.releaseDate }}</dd></div>
              <div>
                <dt>项目主页</dt>
                <dd>
                  <a :href="projectInfo.homepage" target="_blank" rel="noreferrer">
                    {{ projectInfo.homepage }}
                    <ExternalLink :size="14" />
                  </a>
                </dd>
              </div>
            </dl>
          </section>
          <section class="panel about-card">
            <div class="section-title">
              <div><PackageCheck :size="18" /><h2>Release 目标</h2></div>
            </div>
            <div class="release-targets">
              <article v-for="target in releaseTargets" :key="`${target.platform}-${target.arch}`">
                <strong>{{ target.platform }}</strong>
                <span>{{ target.arch }}</span>
                <small>{{ target.packages }}</small>
              </article>
            </div>
            <p class="form-note">Release 包命名：SimpleUI_版本_系统平台_硬件架构.扩展名。</p>
          </section>
          <section class="panel about-card account-card">
            <div class="section-title">
              <div><ShieldCheck :size="18" /><h2>访问安全</h2></div>
            </div>
            <form class="account-form" @submit.prevent="changeWebPassword">
              <label>
                <span>当前密码</span>
                <input v-model="passwordForm.currentPassword" type="password" autocomplete="current-password" required />
              </label>
              <label>
                <span>新密码</span>
                <input v-model="passwordForm.newPassword" type="password" minlength="8" autocomplete="new-password" required />
              </label>
              <label>
                <span>确认新密码</span>
                <input v-model="passwordForm.confirmPassword" type="password" minlength="8" autocomplete="new-password" required />
              </label>
              <button class="primary-button" type="submit" :disabled="authBusy || !passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword">
                <Loader2 v-if="authBusy" class="spin" :size="16" />
                <Save v-else :size="16" />
                修改登录密码
              </button>
            </form>
          </section>
        </div>
      </section>
</template>

<script>
import { useAppBindings } from "../composables/useAppBindings.js";

export default {
  name: "AboutPage",
  setup() {
    return useAppBindings();
  }
};
</script>
