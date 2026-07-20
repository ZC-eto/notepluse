<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'

const props = defineProps<{
  text: string
  label?: string
  /** 气泡相对位置：默认靠右下方 */
  placement?: 'left' | 'right' | 'center'
}>()

const open = ref(false)
const tipId = `help-tip-${Math.random().toString(36).slice(2, 10)}`
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
    :class="[open ? 'open' : '', `place-${props.placement || 'right'}`]"
    role="button"
    tabindex="0"
    :aria-label="props.label || '帮助说明'"
    :aria-expanded="open"
    :aria-describedby="open ? tipId : undefined"
    @mouseenter="show"
    @mouseleave="hideSoon"
    @focus="show"
    @blur="hideNow"
    @keydown="onKeydown"
  >
    <span class="help-tip-icon" aria-hidden="true">?</span>
    <span
      v-if="open"
      :id="tipId"
      class="help-tip-pop"
      role="tooltip"
      @mouseenter="show"
      @mouseleave="hideSoon"
    >
      {{ props.text }}
    </span>
  </span>
</template>
