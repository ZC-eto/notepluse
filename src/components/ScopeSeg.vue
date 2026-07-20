<script setup lang="ts">
defineProps<{
  modelValue: string
  options: { id: string; label: string; count?: number; title?: string }[]
  ariaLabel?: string
}>()
const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>()
</script>

<template>
  <div class="scope-seg" role="tablist" :aria-label="ariaLabel || '范围'">
    <button
      v-for="opt in options"
      :key="opt.id"
      type="button"
      class="seg-btn"
      role="tab"
      :class="{ active: modelValue === opt.id }"
      :aria-selected="modelValue === opt.id"
      :title="opt.title || opt.label"
      @click="emit('update:modelValue', opt.id)"
    >
      {{ opt.label }}
      <em v-if="opt.count" class="scope-count">{{ opt.count }}</em>
    </button>
  </div>
</template>