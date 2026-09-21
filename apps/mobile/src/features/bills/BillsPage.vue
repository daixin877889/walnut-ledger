<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import AppIcon from '../../ui/AppIcon.vue'
import { api, useLedger, loadAllTransactions } from '../../core/api/ledger-context'
import type { LocalTransaction } from '../../core/database/types'
import { formatMoney, groupTransactionsByDay, summarizeTransactions } from './bill-view-model'

const rows = ref<LocalTransaction[]>([])
const { ledger, error, loading, canWrite, load, run } = useLedger()
const editing = ref<LocalTransaction|null>(null), deleting = ref(false)
const editAmount = ref(''), editNote = ref(''), editDate = ref('')
function edit(row:LocalTransaction) {
  if(!canWrite.value)return
  editing.value=row;deleting.value=false;editAmount.value=(row.amount_cents/100).toFixed(2);editNote.value=String(row.note??'')
  const date=new Date(row.occurred_at);editDate.value=new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16)
}
async function saveEdit(){await run(async()=>{
  if(!/^\d{1,9}(\.\d{1,2})?$/.test(editAmount.value)||Number(editAmount.value)<=0)throw new Error('请输入有效的正数金额')
  const date=new Date(editDate.value);if(!Number.isFinite(date.getTime()))throw new Error('请选择有效日期')
  await api.request(`/transactions/${editing.value!.id}`,{method:'PATCH',body:JSON.stringify({ledger_id:ledger.value!.id,version:editing.value!.version,amount_cents:Math.round(Number(editAmount.value)*100),note:editNote.value,occurred_at:date.toISOString()})})
  editing.value=null;rows.value=await loadAllTransactions<LocalTransaction>(ledger.value!.id)
})}
async function remove(){await run(async()=>{
  await api.request(`/transactions/${editing.value!.id}?ledger_id=${encodeURIComponent(ledger.value!.id)}&version=${editing.value!.version}`,{method:'DELETE'})
  editing.value=null;deleting.value=false;rows.value=await loadAllTransactions<LocalTransaction>(ledger.value!.id)
})}
const now = new Date()
const month = ref(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`)
const query = ref('')
const budget=ref<{amount_cents:number}|null>(null),budgetError=ref('')
async function loadBudget(){
  if(!ledger.value)return
  const selectedMonth=month.value;budget.value=null;budgetError.value=''
  try{const value=await api.get<{amount_cents:number}|null>(`/ledgers/${ledger.value.id}/budget?month=${encodeURIComponent(selectedMonth)}`);if(month.value===selectedMonth)budget.value=value&&Number.isSafeInteger(value.amount_cents)?value:null}
  catch{if(month.value===selectedMonth)budgetError.value='预算读取失败，请刷新重试'}
}
watch(month,loadBudget)
const monthRows = computed(() => rows.value.filter(row => { const date = new Date(row.occurred_at); return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}` === month.value }))
const summary = computed(() => summarizeTransactions(monthRows.value))
const visibleRows = computed(() => monthRows.value.filter(row => `${row.note ?? ''} ${row.category_name ?? ''} ${row.account_name ?? ''}`.includes(query.value)))
const groups = computed(() => groupTransactionsByDay(visibleRows.value))
const iconFor = (name: unknown) => ({ 餐饮:'🍜',购物:'🛍️',交通:'🚕',居住:'🏠',工资:'💼' }[String(name)] ?? '🧾')
const titleFor = (row: LocalTransaction) => String(row.note || row.category_name || (row.kind === 'income' ? '收入' : '支出'))
const dayLabel = (value: string) => new Intl.DateTimeFormat('zh-CN', { month:'long', day:'numeric', weekday:'short' }).format(new Date(value))

async function refresh() { await run(async () => { const current = await load(); rows.value = await loadAllTransactions<LocalTransaction>(current.id);await loadBudget() }) }
onMounted(refresh)
</script>

<template>
  <main class="page bills-page">
    <header class="topbar"><div class="brand"><span class="nut-mark">核</span><span>核桃记账</span></div><button aria-label="刷新账单" :disabled="loading" @click="refresh">↻</button></header>
    <p v-if="error" role="alert" class="error">{{error}}</p>
    <section class="hero">
      <div class="hero-ring"></div><div class="month-row"><label>月份 <input v-model="month" type="month" aria-label="账单月份"></label><router-link to="/ledgers">{{ledger?.name || '选择账本'}} ›</router-link></div>
      <small>本月结余</small><h1>¥ {{formatMoney(summary.balanceCents)}}</h1>
      <div class="summary-grid"><div><small>本月支出</small><strong>¥ {{formatMoney(summary.expenseCents)}}</strong></div><div><small>本月收入</small><strong>¥ {{formatMoney(summary.incomeCents)}}</strong></div></div>
    </section>
    <section class="budget-card card"><div><strong>月度预算</strong><router-link to="/budgets">设置 ›</router-link></div><p v-if="budget">¥ {{formatMoney(summary.expenseCents)}} / ¥ {{formatMoney(budget.amount_cents)}} · {{summary.expenseCents>budget.amount_cents?'已超支':'剩余 ¥ '+formatMoney(budget.amount_cents-summary.expenseCents)}}</p><p v-else>{{budgetError || '本月尚未设置预算'}}</p><div v-if="budget" class="progress"><i :style="{width:Math.min(100,summary.expenseCents/budget.amount_cents*100)+'%'}"></i></div></section>
    <div class="section-heading"><div><h2>最近账单</h2><span>每一笔，都清清楚楚</span></div></div>
    <input v-model="query" type="search" placeholder="搜索备注、分类或账户" aria-label="搜索账单" style="width:100%;margin-bottom:12px">
    <section v-for="group in groups" :key="group.date" class="day-card card">
      <div class="day-head"><span>{{dayLabel(group.rows[0]!.occurred_at)}}</span><span>共 {{group.rows.length}} 笔</span></div>
      <article v-for="row in group.rows" :key="row.id" class="bill-row" :role="canWrite?'button':undefined" :tabindex="canWrite?0:undefined" @click="edit(row)" @keydown.enter="edit(row)"><span class="bill-icon">{{row.kind==='transfer'?'⇄':iconFor(row.category_name)}}</span><div><strong>{{row.kind==='transfer'?'账户转账':titleFor(row)}}</strong><small>{{row.category_name || '转账'}} · {{row.account_name}}{{row.kind==='transfer'?' → '+row.transfer_account_name:''}}</small></div><b :class="{income:row.kind==='income'}">{{row.kind==='income'?'+':row.kind==='transfer'?'':'-'}}{{formatMoney(row.amount_cents)}}</b></article>
    </section>
    <section v-if="!visibleRows.length" class="empty-card card">
      <div class="empty-visual"><span></span><i>¥</i></div><h3>{{loading?'正在读取账本':'这个月还没有账单'}}</h3><p>从记录第一笔开始，让每一份收支都有迹可循</p><router-link to="/entry">记下第一笔</router-link>
    </section>
    <div v-if="editing" class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-label="编辑账单"><h2>{{deleting?'删除这笔账单？':'编辑账单'}}</h2><p v-if="error" class="error" role="alert">{{error}}</p><template v-if="deleting"><p>删除后将从收支统计和账户余额中移除。</p><button class="danger" :disabled="loading" @click="remove">确认删除</button><button :disabled="loading" @click="deleting=false">取消删除</button></template><form v-else @submit.prevent="saveEdit"><label>金额<input name="amount" v-model="editAmount" inputmode="decimal" required></label><label>日期<input v-model="editDate" type="datetime-local" required></label><label>备注<textarea v-model="editNote" maxlength="500"></textarea></label><button class="primary" :disabled="loading">保存修改</button><button type="button" :disabled="loading" @click="deleting=true">删除账单</button><button type="button" :disabled="loading" @click="editing=null">关闭</button></form></section></div>
  </main>
</template>

<style scoped>
.bills-page{background:radial-gradient(circle at 10% 0,#e4f8ee,transparent 29%),var(--walnut-bg)}button{border:0;background:none}.topbar{height:46px;display:flex;align-items:center;justify-content:space-between;padding:0 4px 10px}.brand{display:flex;align-items:center;gap:9px;font-size:18px;font-weight:900}.nut-mark{width:31px;height:31px;display:grid;place-items:center;border-radius:10px;background:linear-gradient(145deg,#45be87,#15845a);color:#fff;font-size:15px}.topbar button{width:34px;height:34px;display:grid;place-items:center;border:1px solid var(--walnut-line);border-radius:50%;background:#fff;color:var(--walnut-deep)}
.hero{position:relative;overflow:hidden;padding:20px;border-radius:25px;color:#fff;background:linear-gradient(135deg,#0d6745,#20a46d 68%,#50c48d);box-shadow:0 16px 32px rgba(15,113,75,.2)}.hero-ring{position:absolute;width:175px;height:175px;right:-77px;top:-72px;border:28px solid rgba(255,255,255,.08);border-radius:50%}.month-row{position:relative;display:flex;justify-content:space-between;margin-bottom:18px;font-size:12px;color:rgba(255,255,255,.82)}.month-row span:last-child{display:flex;align-items:center}.hero>small{opacity:.75}.hero h1{margin:2px 0 17px;font-size:33px;letter-spacing:-1.2px}.summary-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.summary-grid div{padding:10px 12px;border-radius:14px;background:rgba(255,255,255,.13)}.summary-grid small,.summary-grid strong{display:block}.summary-grid small{opacity:.75}.summary-grid strong{margin-top:3px;font-size:14px}
.budget-card{margin-top:13px;padding:15px 16px}.budget-card>div{display:flex;justify-content:space-between}.budget-card>div span{color:var(--walnut-green);font-weight:800}.budget-card p{margin:4px 0 10px;color:var(--walnut-muted);font-size:11px}.progress{height:7px;overflow:hidden;border-radius:99px;background:#edf1ef}.progress i{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,var(--walnut-green),#68c99e)}
.section-heading{display:flex;align-items:end;justify-content:space-between;padding:19px 4px 9px}.section-heading h2{margin:0;font-size:17px}.section-heading div span{font-size:10px;color:var(--walnut-muted)}.section-heading button{color:var(--walnut-muted);font-size:12px}.day-card{padding:0 14px;margin-bottom:10px}.day-head{display:flex;justify-content:space-between;padding:12px 0 8px;border-bottom:1px solid var(--walnut-line);color:var(--walnut-muted);font-size:11px}.bill-row{display:grid;grid-template-columns:42px 1fr auto;gap:10px;align-items:center;padding:12px 0}.bill-row+.bill-row{border-top:1px solid #f0f3f1}.bill-icon{width:40px;height:40px;display:grid;place-items:center;border-radius:14px;background:var(--walnut-mint);font-size:18px}.bill-row div strong,.bill-row div small{display:block}.bill-row div small{margin-top:2px;color:var(--walnut-muted);font-size:10px}.bill-row>b{font-size:14px}.bill-row>b.income{color:var(--walnut-green)}
.empty-card{text-align:center;padding:30px 20px}.empty-visual{position:relative;width:86px;height:65px;margin:0 auto 16px;border-radius:18px;background:linear-gradient(145deg,#dff5e9,#f2faf6)}.empty-visual span{position:absolute;left:15px;top:17px;width:56px;height:36px;border:2px solid #79c7a3;border-radius:10px;transform:rotate(-5deg)}.empty-visual i{position:absolute;right:8px;bottom:4px;width:30px;height:30px;display:grid;place-items:center;border-radius:50%;background:var(--walnut-green);color:#fff;font-style:normal}.empty-card h3{margin:0 0 5px}.empty-card p{margin:0 auto 18px;max-width:240px;color:var(--walnut-muted);font-size:12px}.empty-card a{display:inline-block;padding:10px 20px;border-radius:13px;background:var(--walnut-green);color:#fff;font-weight:800}
</style>
