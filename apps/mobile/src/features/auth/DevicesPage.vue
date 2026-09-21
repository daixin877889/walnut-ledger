<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api, useLedger } from '../../core/api/ledger-context'
import { currentSession } from '../../core/session/current-session'
type Device={id:string;name:string;current:boolean;last_seen_at:string}
const router=useRouter(),devices=ref<Device[]>([]),selected=ref<Device|null>(null)
const { error,loading,run }=useLedger()
async function refresh(){devices.value=await api.get<Device[]>('/auth/devices')}
onMounted(()=>run(refresh))
async function revoke(){await run(async()=>{await api.request(`/auth/devices/${selected.value!.id}/revoke`,{method:'POST'});selected.value=null;await refresh()})}
async function logout(){await run(async()=>{await api.request('/auth/logout',{method:'POST'});await currentSession.clear();sessionStorage.removeItem('walnut:ledger');await router.replace('/login')})}
</script>
<template><main class="page"><header class="page-title"><router-link to="/me">‹ 返回我的</router-link><h1>登录设备</h1><p>撤销后，该设备将无法继续访问账本。</p></header><p v-if="error" class="error" role="alert">{{error}}</p><p v-if="loading">正在处理…</p><section class="card list"><article v-for="device in devices" :key="device.id" class="list-row"><span>{{device.name}} {{device.current?'（当前设备）':''}}<small style="display:block">最近活动：{{new Date(device.last_seen_at).toLocaleString()}}</small></span><button v-if="!device.current" :disabled="loading" @click="selected=device">撤销登录</button></article></section><div class="toolbar" style="margin-top:16px"><button :disabled="loading" @click="logout">退出当前账号</button></div><div v-if="selected" class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-label="撤销设备"><h2>撤销「{{selected.name}}」？</h2><p>此操作不删除账本数据。</p><button class="danger" :disabled="loading" @click="revoke">确认撤销</button><button @click="selected=null">取消</button></section></div></main></template>
