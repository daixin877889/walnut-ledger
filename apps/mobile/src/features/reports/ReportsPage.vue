<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useLedger, loadAllTransactions } from '../../core/api/ledger-context'
import type { LocalTransaction } from '../../core/database/types'
import { formatMoney, summarizeTransactions } from '../bills/bill-view-model'
const { ledger, error, loading, load, run } = useLedger()
const rows=ref<LocalTransaction[]>([]), period=ref('本月'), start=ref(''), end=ref('')
const filtered=computed(()=>{
  const now=new Date(), year=now.getFullYear(), month=now.getMonth()
  const from=period.value==='今年'?new Date(year,0,1):period.value==='上月'?new Date(year,month-1,1):period.value==='自定义'?new Date(start.value+'T00:00:00'):new Date(year,month,1)
  const to=period.value==='今年'?new Date(year+1,0,1):period.value==='上月'?new Date(year,month,1):period.value==='自定义'?new Date(end.value+'T00:00:00'):new Date(year,month+1,1)
  if(period.value==='自定义')to.setDate(to.getDate()+1)
  return rows.value.filter(row=>new Date(row.occurred_at)>=from&&new Date(row.occurred_at)<to)
})
const summary=computed(()=>summarizeTransactions(filtered.value))
const categories=computed(()=>{
  const totals=new Map<string,number>()
  for(const row of filtered.value)if(row.kind==='expense'){const name=String(row.category_name||'未分类');totals.set(name,(totals.get(name)||0)+row.amount_cents)}
  return [...totals].sort((a,b)=>b[1]-a[1]).map(([name,cents])=>({name,cents,percent:summary.value.expenseCents?Math.round(cents/summary.value.expenseCents*100):0}))
})
const daily=computed(()=>{
  const totals=new Map<string,number>()
  for(const row of filtered.value)if(row.kind==='expense'){const d=new Date(row.occurred_at);const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;totals.set(key,(totals.get(key)||0)+row.amount_cents)}
  return [...totals].sort(([a],[b])=>a.localeCompare(b)).map(([day,cents])=>({day,cents}))
})
const peak=computed(()=>Math.max(1,...daily.value.map(item=>item.cents)))
onMounted(()=>run(async()=>{const current=await load();rows.value=await loadAllTransactions(current.id)}))
</script>
<template><main class="page reports-page"><header class="page-title"><h1>统计</h1><p>{{ledger?.name}} · 让每一笔消费都有迹可循</p></header><p v-if="error" role="alert" class="error">{{error}}</p><p v-if="loading">正在读取…</p><div class="filters"><button v-for="item in ['本月','上月','今年','自定义']" :key="item" :class="{active:period===item}" @click="period=item">{{item}}</button></div><div v-if="period==='自定义'" class="toolbar"><label>开始日期<input v-model="start" type="date"></label><label>结束日期<input v-model="end" type="date"></label></div><section class="chart-card card"><div class="card-head"><div><small>{{period}}支出</small><h2>¥ {{formatMoney(summary.expenseCents)}}</h2></div><span class="trend">共 {{filtered.length}} 笔</span></div><div v-if="daily.length" class="bar-chart" role="img" aria-label="每日支出趋势"><i v-for="item in daily" :key="item.day" :title="`${item.day}：${formatMoney(item.cents)}元`" :style="{height:(item.cents/peak*100)+'%'}"></i></div><p v-else>该时段暂无支出。</p><div class="labels"><span v-for="item in daily.filter((_,i)=>i%Math.max(1,Math.ceil(daily.length/5))===0)" :key="item.day">{{item.day}}</span></div><p>收入 ¥ {{formatMoney(summary.incomeCents)}} · 结余 ¥ {{formatMoney(summary.balanceCents)}}</p></section><section class="chart-card card"><div class="card-head"><strong>分类占比</strong></div><div class="legend"><p v-for="item in categories" :key="item.name"><span>{{item.name}} · ¥ {{formatMoney(item.cents)}}</span><b>{{item.percent}}%</b></p><p v-if="!categories.length">暂无分类统计。</p></div></section></main></template>
<style scoped>.reports-page{background:radial-gradient(circle at 90% 0,#e7f8ef,transparent 27%),var(--walnut-bg)}button{border:0;background:none}.filters{display:flex;gap:7px;overflow:auto;margin:0 2px 13px}.filters button{padding:8px 14px;border:1px solid var(--walnut-line);border-radius:99px;background:#fff;color:var(--walnut-muted);white-space:nowrap}.filters .active{background:var(--walnut-deep);border-color:var(--walnut-deep);color:#fff;font-weight:700}.chart-card{padding:17px;margin-bottom:13px}.card-head{display:flex;align-items:flex-start;justify-content:space-between}.card-head small{color:var(--walnut-muted)}.card-head h2{margin:3px 0;font-size:27px}.card-head button{color:var(--walnut-muted);font-size:11px}.trend{padding:5px 8px;border-radius:8px;background:var(--walnut-mint);color:var(--walnut-green);font-size:10px}.bar-chart{height:150px;display:flex;align-items:end;gap:9px;padding:19px 3px 0;border-bottom:1px solid var(--walnut-line);background:repeating-linear-gradient(to bottom,transparent 0,transparent 36px,#eef2ef 37px)}.bar-chart i{flex:1;min-height:9px;border-radius:7px 7px 2px 2px;background:linear-gradient(#65c99e,var(--walnut-green));opacity:.9}.labels{display:flex;justify-content:space-between;padding-top:7px;color:var(--walnut-muted);font-size:9px}.donut-row{display:grid;grid-template-columns:125px 1fr;gap:15px;align-items:center;margin-top:18px}.donut{width:120px;height:120px;padding:22px;border-radius:50%;background:conic-gradient(var(--walnut-green) 0 35%,var(--walnut-gold) 35% 59%,var(--walnut-blue) 59% 78%,#9877d8 78%)}.donut>div{height:100%;display:grid;place-items:center;align-content:center;border-radius:50%;background:#fff}.donut b{font-size:17px}.donut small{color:var(--walnut-muted);font-size:9px}.legend p{display:flex;justify-content:space-between;margin:9px 0}.legend span{color:var(--walnut-muted)}.legend i{display:inline-block;width:8px;height:8px;margin-right:6px;border-radius:50%}.insight{display:flex;gap:11px;padding:15px}.insight>span{width:34px;height:34px;display:grid;place-items:center;border-radius:11px;background:var(--walnut-mint);color:var(--walnut-green)}.insight strong{font-size:13px}.insight p{margin:3px 0 0;color:var(--walnut-muted);font-size:10px}</style>
