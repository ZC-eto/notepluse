<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'

const props = defineProps<{
  text: string
  label?: string
}>()

const open = ref(false)
let closeTimer: ReturnType<typeof setTimeout> | null = null

function show() {
  if (closeTimer) {
    clearTimeout(closeTimer)
    closeTimer = null
  }
  open.value = true
}

function hideSoon() {
  if (closeTimer) clearTimeout(closeTimer)
  closeTimer = setTimeout(() => {
    open.value = false
    closeTimer = null
  }, 120)
}

function hideNow() {
  if (closeTimer) {
    clearTimeout(closeTimer)
    closeTimer = null
  }
  open.value = false
}

function onKeydown(ev: KeyboardEvent) {
  if (ev.key === 'Escape') {
    hideNow()
    ;(ev.currentTarget as HTMLElement | null)?.blur?.()
  }
  if (ev.key === 'Enter' || ev.key === ' ') {
    ev.preventDefault()
    open.value = !open.value
  }
}

onBeforeUnmount(() => {
  if (closeTimer) clearTimeout(closeTimer)
})
</script>

<template>
  <span
    class="help-tip"
    :class="{ open }"
    role="button"
    tabindex="0"
    :aria-label="props.label || '帮助说明'"
    :aria-expanded="open"
    :aria-describedby="open ? 'help-tip-pop' : undefined"
    @mouseenter="show"
    @mouseleave="hideSoon"
    @focus="show"
    @blur="hideNow"
    @keydown="onKeydown"
  >
    <span class="help-tip-icon" aria-hidden="true">?</span>
    <span
      v-if="open"
      id="help-tip-pop"
      class="help-tip-pop"
      role="tooltip"
      @mouseenter="show"
      @mouseleave="hideSoon"
    >
      {{ props.text }}
    </span>
  </span>
</template>
