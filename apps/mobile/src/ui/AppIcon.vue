<script setup lang="ts">
withDefaults(defineProps<{ name: string; size?: number }>(), { size: 22 })
</script>

<template>
  <svg class="app-icon" :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <template v-if="name==='home'"><path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10M9 20v-6h6v6"/></template>
    <template v-else-if="name==='chart'"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></template>
    <template v-else-if="name==='wallet'"><path d="M4 5h14a2 2 0 0 1 2 2v12H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"/><path d="M16 11h6v5h-6a2.5 2.5 0 0 1 0-5Z"/></template>
    <template v-else-if="name==='user'"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></template>
    <template v-else-if="name==='plus'"><path d="M12 5v14M5 12h14"/></template>
    <template v-else-if="name==='search'"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></template>
    <template v-else-if="name==='backspace'"><path d="m9 7-5 5 5 5h11V7H9Z"/><path d="m13 10 4 4m0-4-4 4"/></template>
    <template v-else-if="name==='calendar'"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4m8-4v4M3 10h18"/></template>
    <template v-else-if="name==='chevron'"><path d="m9 18 6-6-6-6"/></template>
    <template v-else-if="name==='sync'"><path d="M20 7h-5V2M4 17h5v5"/><path d="M18.5 10A7 7 0 0 0 6 6L4 8m2 6a7 7 0 0 0 12 4l2-2"/></template>
    <template v-else><circle cx="12" cy="12" r="8"/><path d="M12 8v8M8 12h8"/></template>
  </svg>
</template>

<style scoped>.app-icon{display:block;flex:none}</style>
