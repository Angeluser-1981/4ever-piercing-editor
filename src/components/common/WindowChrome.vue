<script setup>
defineProps({
  title: { type: String, required: true },
  compact: { type: Boolean, default: false },
})

defineEmits(['close'])
</script>

<template>
  <section class="window" :class="{ 'window--compact': compact }">
    <div class="window__titlebar">
      <div class="window__mark" aria-hidden="true">✦</div>
      <span>{{ title }}</span>
      <div class="window__controls" aria-hidden="true">
        <i></i><i></i><i></i>
      </div>
    </div>
    <slot />
  </section>
</template>
