<script setup lang="ts">
import { computed, ref } from 'vue'
import AppIcon from '../../ui/AppIcon.vue'
import { createIndexedDbDatabase } from '../../core/database/indexed-db'
import { amountCents, initialAmountState, reduceAmount } from './amount-machine'
import { expenseCategories, incomeCategories } from './categories'

const type = ref<'支出'|'收入'|'转账'>('支出')
const selected = ref('餐饮')
const state = ref(initialAmountState())
const saved = ref(false)
const categories = computed(() => type.value === '收入' ? incomeCategories : expenseCategories)
const selectedCategory = computed(() => categories.value.find(item => item.name === selected.value) ?? categories.value[0]!)
const today = new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit' }).format(new Date()).replace('/', '月') + '日'

function changeType(next: '支出'|'收入'|'转账') {
  type.value = next
  selected.value = next === '收入' ? '工资' : '餐饮'
}

async function save(again = false) {
  const cents = amountCents(state.value)
  if (cents <= 0) return
  const id = crypto.randomUUID()
  const ledgerId = localStorage.getItem('ledger_id') ?? 'local'
  const transaction = { id, ledger_id: ledgerId, amount_cents: cents, occurred_at: new Date().toISOString(), version: 1, kind: type.value === '收入' ? 'income' : type.value === '转账' ? 'transfer' : 'expense', category_name: selected.value, account_name: '现金账户', member_name: '自己', note: '' }
  const db = await createIndexedDbDatabase()
  await db.saveWithOutbox(transaction, { operation_id: crypto.randomUUID(), ledger_id: ledgerId, entity_type: 'transaction', entity_id: id, operation: 'upsert', base_version: 0, payload: transaction })
  saved.value = true
  if (again) state.value = initialAmountState()
  else window.location.assign('/bills')
}

function press(key: string) {
  if (key === '完成') { void save(false); return }
  state.value = reduceAmount(state.value, key)
}

function close() { window.history.back() }
</script>

<template>
  <main class="entry-page">
    <header class="entry-header"><button class="close" aria-label="关闭" @click="close">×</button><h1>记一笔</h1><button class="more" aria-label="更多">•••</button></header>
    <div class="segment" role="tablist"><button v-for="item in (['支出','收入','转账'] as const)" :key="item" :class="{active:type===item}" @click="changeType(item)">{{item}}</button></div>
    <section class="category-panel" aria-label="分类">
      <div class="category-title"><strong>{{type==='收入'?'选择收入分类':type==='转账'?'选择转出账户':'选择支出分类'}}</strong><button>管理分类 <span>＋</span></button></div>
      <div class="category-grid">
        <button v-for="category in categories" :key="category.name" data-category :class="['category',{selected:selected===category.name}]" @click="selected=category.name"><span :class="['category-icon',category.tone]">{{category.icon}}</span><span>{{category.name}}</span></button>
      </div>
    </section>
    <section class="entry-console">
      <p v-if="saved" class="saved" role="status">已保存到本机，等待同步</p>
      <div class="quick-meta">
        <button><AppIcon name="calendar" :size="18"/><strong>今天</strong><small>{{today}}</small></button>
        <button><span class="mini-icon">¥</span><strong>现金账户</strong><small>付款账户</small></button>
        <button><AppIcon name="user" :size="18"/><strong>自己</strong><small>成员</small></button>
        <button><span class="mini-icon">⌁</span><strong>添加备注</strong><small>备注</small></button>
      </div>
      <div class="amount-line"><span class="chosen"><span :class="['chosen-icon',selectedCategory.tone]">{{selectedCategory.icon}}</span>{{selectedCategory.name}}</span><strong :class="{'is-long':state.display.length>8}">¥ {{state.display}}</strong></div>
      <div class="keypad">
        <button v-for="key in ['1','2','3','+','4','5','6','-','7','8','9']" :key="key" :class="{operator:key==='+'||key==='-'}" @click="press(key)">{{key==='+'?'＋':key==='-'?'－':key}}</button>
        <button class="done" @click="press('完成')">完成</button>
        <button @click="press('.')">.</button><button @click="press('0')">0</button><button aria-label="退格" @click="press('backspace')"><AppIcon name="backspace"/></button>
        <button class="again" @click="save(true)">保存并继续记一笔</button>
      </div>
    </section>
  </main>
</template>

<style scoped>
.entry-page{height:100dvh;display:grid;grid-template-rows:auto auto minmax(0,1fr) auto;overflow:hidden;background:#f7faf8;padding-top:var(--safe-top)}button{border:0;background:none}.entry-header{height:52px;display:grid;grid-template-columns:46px 1fr 46px;align-items:center;padding:0 8px}.entry-header h1{text-align:center;font-size:18px;margin:0}.close{font-size:28px;color:#738079}.more{letter-spacing:2px;color:#738079}.segment{display:flex;margin:0 16px 10px;padding:4px;background:#e8efeb;border-radius:14px}.segment button{flex:1;padding:8px;border-radius:11px;color:var(--walnut-muted)}.segment .active{background:#fff;color:var(--walnut-deep);font-weight:800;box-shadow:0 4px 12px rgba(0,0,0,.06)}
.category-panel{min-height:0;overflow-y:auto;border-bottom:1px solid var(--walnut-line);scrollbar-width:none}.category-title{position:sticky;top:0;z-index:2;display:flex;align-items:center;justify-content:space-between;padding:8px 18px;background:rgba(247,250,248,.95);backdrop-filter:blur(8px)}.category-title strong{font-size:14px}.category-title button{font-size:12px;color:var(--walnut-muted)}.category-title span{color:var(--walnut-green)}.category-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px 4px;padding:4px 12px 18px}.category{min-width:0;display:grid;place-items:center;gap:5px;padding:0;font-size:11px;color:var(--walnut-muted)}.category-icon,.chosen-icon{display:grid;place-items:center;background:#fff;border:1px solid var(--walnut-line)}.category-icon{width:47px;height:47px;border-radius:16px;font-size:21px;box-shadow:0 4px 13px rgba(31,72,52,.035)}.category.selected{color:var(--walnut-deep);font-weight:800}.category.selected .category-icon{border:2px solid var(--walnut-green);background:var(--walnut-mint);box-shadow:0 7px 18px rgba(32,164,109,.14)}
.entry-console{position:relative;background:#fff;box-shadow:0 -10px 28px rgba(20,62,44,.08);padding-bottom:var(--safe-bottom)}.saved{position:absolute;left:50%;top:-37px;transform:translateX(-50%);z-index:5;margin:0;padding:7px 14px;border-radius:99px;background:var(--walnut-deep);color:#fff;font-size:12px;white-space:nowrap}.quick-meta{height:58px;display:grid;grid-template-columns:repeat(4,1fr);border-bottom:1px solid var(--walnut-line)}.quick-meta button{display:grid;grid-template-columns:20px 1fr;grid-template-rows:1fr 1fr;column-gap:4px;align-items:end;text-align:left;padding:8px 5px;color:var(--walnut-deep)}.quick-meta svg,.mini-icon{grid-row:1/3;align-self:center}.quick-meta strong{font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.quick-meta small{color:var(--walnut-muted);font-size:9px}.mini-icon{font-weight:800}
.amount-line{height:66px;display:flex;align-items:center;justify-content:space-between;padding:8px 17px;border-bottom:1px solid var(--walnut-line)}.chosen{display:flex;align-items:center;gap:8px;color:var(--walnut-muted)}.chosen-icon{width:33px;height:33px;border-radius:11px;font-size:16px;background:var(--walnut-mint)}.amount-line>strong{font-size:30px;letter-spacing:-1px}.amount-line>strong.is-long{font-size:23px}.keypad{height:255px;display:grid;grid-template-columns:repeat(4,1fr);grid-template-rows:repeat(5,1fr);gap:1px;background:#e8eeea}.keypad button{background:#fff;font-size:21px}.keypad button:active{background:var(--walnut-mint)}.keypad .operator{font-size:18px;color:var(--walnut-deep);font-weight:800;background:#f5faf7}.keypad .done{grid-row:3/5;grid-column:4;background:linear-gradient(160deg,var(--walnut-green-2),var(--walnut-green));color:#fff;font-size:16px;font-weight:800}.keypad .again{grid-column:1/5;background:#eff9f4;color:var(--walnut-deep);font-size:13px;font-weight:800}
.orange{background:#fff3e9}.pink{background:#fff0f4}.blue{background:#edf4ff}.green{background:#eaf8f1}.purple{background:#f4efff}.red{background:#fff0f0}.cyan{background:#eaf8fa}.gold{background:#fff7df}.gray{background:#f1f3f2}@media(max-height:740px){.category-grid{gap:8px 3px}.category-icon{width:42px;height:42px}.keypad{height:228px}.quick-meta{height:52px}.amount-line{height:59px}}@media(max-width:340px){.category-icon{width:40px;height:40px}.category-grid{padding-inline:7px}.amount-line>strong{font-size:26px}}
</style>
