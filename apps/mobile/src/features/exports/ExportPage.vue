<script setup lang="ts">
import { onMounted,ref } from 'vue'
import { api,useLedger,loadAllTransactions } from '../../core/api/ledger-context'
import type { LocalTransaction } from '../../core/database/types'
import { transactionCsv } from './csv'
const {ledger,error,loading,load,run}=useLedger(),message=ref('')
onMounted(()=>run(async()=>{await load()}))
async function download(format:'csv'|'json'){await run(async()=>{
  message.value='';if(!ledger.value)throw new Error('请先选择账本')
  const rows=await loadAllTransactions<LocalTransaction>(ledger.value.id)
  const data=format==='csv'?transactionCsv(rows):JSON.stringify({format:'walnut-ledger-export-v1',exported_at:new Date().toISOString(),ledger:ledger.value,accounts:await api.get(`/ledgers/${ledger.value.id}/accounts`),categories:await api.get(`/ledgers/${ledger.value.id}/categories`),transactions:rows},null,2)
  const url=URL.createObjectURL(new Blob([data],{type:format==='csv'?'text/csv;charset=utf-8':'application/json'}))
  const link=document.createElement('a');link.href=url;link.download=`walnut-ledger-${new Date().toISOString().slice(0,10)}.${format}`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)
  message.value=`已生成 ${rows.length} 笔记录的${format.toUpperCase()}文件，请在浏览器下载中保存。`
})}
</script>
<template><main class="page"><header class="page-title"><router-link to="/me">‹ 返回我的</router-link><h1>导出数据</h1><p>{{ledger?.name}} · 仅导出当前账本</p></header><p v-if="error" role="alert" class="error">{{error}}</p><p v-if="message" role="status">{{message}}</p><section class="card list"><h2>账单 CSV</h2><p>可用 Excel 打开；包含金额、账户、分类、备注和原始时间。</p><div class="toolbar"><button :disabled="loading||!ledger" @click="download('csv')">导出 CSV</button></div><h2>JSON 数据副本</h2><p>包含当前账本的账单、未归档账户与分类。不是完整数据库备份，尚不支持自动恢复。</p><div class="toolbar"><button :disabled="loading||!ledger" @click="download('json')">导出 JSON</button></div><p>导出文件包含个人财务信息，请妥善保管。原生端文件保存尚未验收。</p></section></main></template>
