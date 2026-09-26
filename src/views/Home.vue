<script setup>
import { brand } from '../config/brand.js'
import WindowChrome from '../components/common/WindowChrome.vue'
</script>

<template>
  <main class="home-shell">
    <div class="home-haze" aria-hidden="true"></div>
    <WindowChrome title="4EVER.EXE — 私人档案 / PRIVATE ARCHIVE">
      <div class="menu-strip" aria-hidden="true">文件&nbsp;&nbsp; 编辑&nbsp;&nbsp; 视图&nbsp;&nbsp; 搭配&nbsp;&nbsp; 饰品&nbsp;&nbsp; 档案&nbsp;&nbsp; 帮助</div>
      <div class="home-window">
        <div class="sigil" aria-hidden="true">
          <span class="sigil__ring"></span>
          <span class="sigil__star">✦</span>
          <small>PLACEMENT<br />SIGNAL</small>
        </div>

        <div class="home-copy">
          <p class="eyebrow">PERSONAL FILE / 001</p>
          <h1>{{ brand.name }}</h1>
          <p class="subtitle">{{ brand.subtitle }}</p>
          <p class="home-note">在自己的耳朵上，先搭出来。</p>

          <RouterLink class="primary-action" to="/editor">
            <span><b>开始搭配</b><small>START A STACK</small></span>
            <b aria-hidden="true">→</b>
          </RouterLink>
        </div>

        <div class="home-index" aria-label="Future sections">
          <button type="button" disabled><span>02</span><b>穿刺地图<small>BODY MAP</small></b><i>未开放</i></button>
          <button type="button" disabled><span>03</span><b>搭配档案<small>MEMORY FILES</small></b><i>暂无</i></button>
        </div>
      </div>
      <div class="status-strip">
        <span>本地模式 / LOCAL</span>
        <span>无云端连接</span>
        <span>核心试戴</span>
      </div>
    </WindowChrome>
    <p class="home-footer">私人耳饰搭配系统 · 图片只停留在当前设备</p>
  </main>
</template>
