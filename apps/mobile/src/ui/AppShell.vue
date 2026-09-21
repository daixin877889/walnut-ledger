<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import AppIcon from './AppIcon.vue'
const route = useRoute()
const hideNavigation = computed(() => ['/entry', '/login', '/register'].includes(route.path))
const items = [
  { label: '账单', path: '/bills', icon: 'home' },
  { label: '统计', path: '/reports', icon: 'chart' },
  { label: '账户', path: '/accounts', icon: 'wallet' },
  { label: '我的', path: '/me', icon: 'user' },
]
</script>

<template>
  <div class="app-shell">
    <slot><router-view /></slot>
    <nav v-if="!hideNavigation" class="bottom-nav" aria-label="主导航">
      <router-link v-for="item in items.slice(0,2)" :key="item.path" :to="item.path" :aria-label="item.label"><AppIcon :name="item.icon"/><span>{{item.label}}</span></router-link>
      <router-link to="/entry" class="entry-action" aria-label="记一笔"><AppIcon name="plus" :size="29"/><span>记一笔</span></router-link>
      <router-link v-for="item in items.slice(2)" :key="item.path" :to="item.path" :aria-label="item.label"><AppIcon :name="item.icon"/><span>{{item.label}}</span></router-link>
    </nav>
  </div>
</template>

<style scoped>
.app-shell{min-height:100dvh;position:relative}
.bottom-nav{position:fixed;z-index:20;left:50%;bottom:0;width:min(100%,430px);height:calc(72px + var(--safe-bottom));transform:translateX(-50%);padding:7px 10px var(--safe-bottom);display:grid;grid-template-columns:repeat(5,1fr);align-items:center;background:rgba(255,255,255,.96);border-top:1px solid var(--walnut-line);backdrop-filter:blur(16px)}
.bottom-nav a{height:55px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;color:#87938d;font-size:10px;font-weight:600}
.bottom-nav a.router-link-active{color:var(--walnut-green)}
.bottom-nav .entry-action{width:58px;height:58px;justify-self:center;margin-top:-30px;border-radius:19px;color:#fff;background:linear-gradient(145deg,var(--walnut-green-2),var(--walnut-deep));box-shadow:0 10px 24px rgba(32,164,109,.33)}
.entry-action span{position:absolute;top:52px;color:var(--walnut-green);white-space:nowrap}
</style>
