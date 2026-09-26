<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import WindowChrome from '../components/common/WindowChrome.vue'
import { deleteStack, listStacks, renameStack } from '../services/stackArchive.js'

const router = useRouter()
const records = ref([])
const thumbnailUrls = ref({})
const isLoading = ref(true)
const archiveMessage = ref('读取本机档案… / READING LOCAL FILES')
const renamingId = ref(null)
const renameValue = ref('')

function releaseThumbnails() {
  for (const url of Object.values(thumbnailUrls.value)) URL.revokeObjectURL(url)
  thumbnailUrls.value = {}
}

async function refreshFiles(message = '') {
  isLoading.value = true
  try {
    const nextRecords = await listStacks()
    releaseThumbnails()
    thumbnailUrls.value = Object.fromEntries(nextRecords
      .filter((record) => record.thumbnailBlob)
      .map((record) => [record.id, URL.createObjectURL(record.thumbnailBlob)]))
    records.value = nextRecords
    archiveMessage.value = message || `${nextRecords.length} 份本机搭配 / LOCAL FILES`
  } catch (error) {
    archiveMessage.value = `读取失败 / ${error?.message || 'READ FAILED'}`
  } finally {
    isLoading.value = false
  }
}

function formattedDate(value) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(new Date(value))
}

function openStack(id) {
  router.push({ name: 'editor', query: { stack: id } })
}

function beginRename(record) {
  renamingId.value = record.id
  renameValue.value = record.name
}

function cancelRename() {
  renamingId.value = null
  renameValue.value = ''
}

async function commitRename(record) {
  const name = renameValue.value.trim()
  if (!name || name === record.name) {
    cancelRename()
    return
  }
  try {
    await renameStack(record.id, name)
    cancelRename()
    await refreshFiles(`${name} 已改名 / RENAMED`)
  } catch (error) {
    archiveMessage.value = `改名失败 / ${error?.message || 'RENAME FAILED'}`
  }
}

async function removeFile(record) {
  if (!window.confirm(`删除 ${record.name}？\n这份本机工程将无法恢复。`)) return
  try {
    await deleteStack(record.id)
    if (renamingId.value === record.id) cancelRename()
    await refreshFiles(`${record.name} 已删除 / DELETED`)
  } catch (error) {
    archiveMessage.value = `删除失败 / ${error?.message || 'DELETE FAILED'}`
  }
}

onMounted(() => refreshFiles())
onBeforeUnmount(releaseThumbnails)
</script>

<template>
  <main class="memory-page">
    <WindowChrome title="4EVER.EXE — 搭配档案 / MEMORY FILES">
      <nav class="menu-strip memory-menu">
        <RouterLink to="/">返回主页</RouterLink>
        <RouterLink to="/editor">新建搭配</RouterLink>
        <span>本机档案</span>
      </nav>

      <header class="memory-header">
        <div>
          <p class="eyebrow">PRIVATE ARCHIVE / LOCAL DEVICE</p>
          <h1>MEMORY FILES</h1>
          <p>可继续编辑的耳饰搭配工程，仅保存在当前浏览器。</p>
        </div>
        <div class="memory-counter"><b>{{ records.length }}</b><small>SAVED STACKS</small></div>
      </header>

      <section class="memory-file-list" aria-label="已保存搭配">
        <div class="memory-file-list__heading" aria-hidden="true">
          <span>预览</span><span>文件名 / 日期</span><span>耳侧 / 饰品</span><span>操作</span>
        </div>

        <article v-for="record in records" :key="record.id" class="memory-file-row">
          <button class="memory-file-thumb" type="button" :aria-label="`打开 ${record.name}`" @click="openStack(record.id)">
            <img v-if="thumbnailUrls[record.id]" :src="thumbnailUrls[record.id]" alt="" />
            <span v-else>NO PREVIEW</span>
          </button>

          <div class="memory-file-name">
            <template v-if="renamingId === record.id">
              <input v-model="renameValue" maxlength="32" aria-label="搭配名称" @keyup.enter="commitRename(record)" @keyup.esc="cancelRename" />
              <span><button type="button" @click="commitRename(record)">保存名称</button><button type="button" @click="cancelRename">取消</button></span>
            </template>
            <template v-else>
              <button type="button" @click="openStack(record.id)"><b>{{ record.name }}</b><small>{{ formattedDate(record.updatedAt) }}</small></button>
            </template>
          </div>

          <div class="memory-file-meta">
            <b>{{ record.ear?.side === 'left' ? 'LEFT EAR' : 'RIGHT EAR' }}</b>
            <small>{{ record.jewelryLayers?.length || 0 }} 件饰品 / PIECES</small>
          </div>

          <div class="memory-file-actions">
            <button type="button" @click="openStack(record.id)">打开 <small>OPEN</small></button>
            <button type="button" @click="beginRename(record)">改名 <small>RENAME</small></button>
            <button class="memory-file-delete" type="button" @click="removeFile(record)">删除 <small>DELETE</small></button>
          </div>
        </article>

        <div v-if="!isLoading && !records.length" class="memory-empty">
          <b>暂无搭配档案</b>
          <small>NO MEMORY FILES</small>
          <RouterLink to="/editor">开始第一套搭配 →</RouterLink>
        </div>
      </section>

      <div class="status-strip memory-status">
        <span>{{ archiveMessage }}</span>
        <span>INDEXEDDB</span>
        <span>无云端连接</span>
      </div>
    </WindowChrome>
  </main>
</template>
