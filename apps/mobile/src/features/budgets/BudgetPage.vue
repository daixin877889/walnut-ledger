<script setup lang="ts">
import { onMounted,ref,watch } from 'vue'
import { api,useLedger } from '../../core/api/ledger-context'
const {ledger,error,loading,canManage,load,run}=useLedger()
const date=new Date(),month=ref(`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`)
const amount=ref(''),version=ref(0),saved=ref(false)
async function refresh(){saved.value=false;amount.value='';version.value=0;const budget=await api.get<{amount_cents:number;version:number}|null>(`/ledgers/${ledger.value!.id}/budget?month=${encodeURIComponent(month.value)}`);if(budget){amount.value=(budget.amount_cents/100).toFixed(2);version.value=budget.version}}
onMounted(()=>run(async()=>{await load();await refresh()}))
watch(month,()=>{if(ledger.value)void run(refresh)})
async function save(){await run(async()=>{
  if(!/^\d{1,9}(\.\d{1,2})?$/.test(amount.value)||Number(amount.value)<=0)throw new Error('请输入有效的正数预算')
  const result=await api.request<{version:number}>(`/ledgers/${ledger.value!.id}/budget`,{method:'PUT',body:JSON.stringify({month:month.value,amount_cents:Math.round(Number(amount.value)*100),version:version.value})})
  version.value=result.version;saved.value=true
})}
</script>
<template><main class="page"><header class="page-title"><router-link to="/bills">‹ 返回账单</router-link><h1>月度预算</h1><p>{{ledger?.name}} · 月总支出额度</p></header><p v-if="error" role="alert" class="error">{{error}}</p><p v-if="saved" role="status">预算已保存到云端</p><section class="card list"><form @submit.prevent="save" style="display:grid;gap:16px"><label>月份<input v-model="month" type="month" required :disabled="loading"></label><label>预算（元）<input v-model="amount" name="amount" inputmode="decimal" required :disabled="loading||!canManage"></label><button class="primary" :disabled="loading||!canManage">保存预算</button><button type="button" :disabled="loading" @click="run(refresh)">刷新预算</button><p v-if="ledger&&!canManage">仅账本所有者可修改预算。</p></form></section></main></template>
