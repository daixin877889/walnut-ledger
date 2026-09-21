<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import AppIcon from '../../ui/AppIcon.vue'
import { amountCents, initialAmountState, reduceAmount, MAX_AMOUNT_CENTS } from './amount-machine'
import { api, useLedger, type Category, type Account } from '../../core/api/ledger-context'
import { ApiError } from '../../core/api/client'

const type = ref<'支出'|'收入'|'转账'>('支出')
const router = useRouter(), route = useRoute()
const { ledger, error, loading, canWrite, load, run } = useLedger()
const selected = ref('')
const allCategories = ref<Category[]>([]), accounts = ref<Account[]>([])
const accountId = ref(''), toAccountId = ref(''), note = ref('')
const editor = ref('')
const dateValue = ref(localDateTime(new Date()))
const operationKey = ref(crypto.randomUUID())
const pendingRequest = ref<{ path:string; body:string }|null>(null)
const locked = computed(() => loading.value || !!pendingRequest.value)
function localDateTime(date: Date) { return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16) }
const state = ref(initialAmountState())
const saved = ref(false)
const categories = computed(() => allCategories.value.filter(item => item.kind === (type.value === '收入' ? 'income' : 'expense')))
const selectedCategory = computed(() => categories.value.find(item => item.id === selected.value) ?? { name: '选择分类', icon: '＋', color: '#eaf8f1' })
const accountName = computed(() => accounts.value.find(item => item.id === accountId.value)?.name ?? '选择账户')
onMounted(() => run(async () => {
  const current = await load()
  ;[allCategories.value, accounts.value] = await Promise.all([api.get<Category[]>(`/ledgers/${current.id}/categories`), api.get<Account[]>(`/ledgers/${current.id}/accounts`)])
  if (route?.query.type === 'transfer') type.value = '转账'
  selected.value = categories.value[0]?.id ?? ''; accountId.value = accounts.value[0]?.id ?? ''
}))

function changeType(next: '支出'|'收入'|'转账') {
  if(locked.value)return
  type.value = next
  selected.value = categories.value[0]?.id ?? ''
  operationKey.value = crypto.randomUUID(); saved.value = false
}

async function save(again = false) {
  await run(async () => {
    if(!pendingRequest.value) {
    const cents = amountCents(state.value)
    if (!Number.isSafeInteger(cents) || cents <= 0 || cents > MAX_AMOUNT_CENTS) throw new Error('请输入有效的正数金额，最大 999,999,999.99 元')
    if (!ledger.value || !canWrite.value) throw new Error('当前账本没有记账权限')
    if (!accountId.value) throw new Error('请先创建并选择账户')
    if (type.value === '转账' ? !toAccountId.value || toAccountId.value === accountId.value : !selected.value) throw new Error(type.value === '转账' ? '请选择不同的转入、转出账户' : '请先创建并选择分类')
    const date = new Date(dateValue.value)
    if (!Number.isFinite(date.getTime())) throw new Error('请选择有效日期')
    const common = { ledger_id: ledger.value.id, idempotency_key: operationKey.value, amount_cents: cents, occurred_at: date.toISOString() }
    const body = type.value === '转账' ? { ...common, from_account_id: accountId.value, to_account_id: toAccountId.value } : { ...common, kind: type.value === '收入' ? 'income' : 'expense', account_id: accountId.value, category_id: selected.value, note: note.value }
    pendingRequest.value ??= { path:type.value === '转账' ? '/transfers' : '/transactions',body:JSON.stringify(body) }
    }
    try { await api.request(pendingRequest.value.path, { method:'POST',body:pendingRequest.value.body }) }
    catch(cause) {
      if(cause instanceof ApiError && cause.status>=400 && cause.status<500)pendingRequest.value=null
      else throw new Error('保存结果尚未确认，请勿退出本页；恢复网络后再次点击保存，将重试原记录而不会重复记账。')
      throw cause
    }
    pendingRequest.value=null
    saved.value = true; operationKey.value = crypto.randomUUID()
    if (again) { state.value = initialAmountState(); note.value = '' }
    else await router.push('/bills')
  })
}

function press(key: string) {
  if (key === '完成') { void save(false); return }
  if(locked.value)return
  state.value = reduceAmount(state.value, key)
  saved.value = false
}

function close() { if(!locked.value)void router.push('/bills') }
</script>

<template>
  <main class="entry-page">
    <header class="entry-header"><button class="close" aria-label="关闭" @click="close">×</button><h1>记一笔</h1><span></span></header>
    <div class="segment" role="tablist"><button v-for="item in (['支出','收入','转账'] as const)" :key="item" :disabled="locked" :class="{active:type===item}" @click="changeType(item)">{{item}}</button></div>
    <section class="category-panel" aria-label="分类">
      <div class="category-title"><strong>{{type==='收入'?'选择收入分类':type==='转账'?'账户间转账':'选择支出分类'}}</strong><button v-if="type!=='转账'" :disabled="locked" @click="router.push('/categories')">管理分类 <span>＋</span></button></div>
      <p v-if="error" class="error" role="alert">{{error}}</p>
      <p v-if="loading">正在处理…</p>
      <div v-if="type!=='转账'" class="category-grid">
        <button v-for="category in categories" :key="category.id" data-category :disabled="locked" :class="['category',{selected:selected===category.id}]" @click="selected=category.id"><span class="category-icon" :style="{borderColor:category.color}">{{category.icon}}</span><span>{{category.name}}</span></button>
      </div>
      <p v-if="!loading && !categories.length && type!=='转账'" class="empty-tip">暂无分类，请点击管理分类添加。</p>
      <div v-if="type==='转账'" class="transfer-fields"><label>转出账户<select v-model="accountId" :disabled="locked"><option value="">请选择</option><option v-for="item in accounts" :key="item.id" :value="item.id">{{item.name}}</option></select></label><label>转入账户<select v-model="toAccountId" :disabled="locked"><option value="">请选择</option><option v-for="item in accounts.filter(item=>item.id!==accountId)" :key="item.id" :value="item.id">{{item.name}}</option></select></label><p>转账不计入收入或支出。</p></div>
    </section>
    <section class="entry-console">
      <p v-if="saved" class="saved" role="status">已保存到云端</p>
      <div class="quick-meta">
        <button data-edit="date" :disabled="locked" @click="editor='date'"><AppIcon name="calendar" :size="18"/><strong>{{dateValue.slice(5,10)}}</strong><small>记账时间</small></button>
        <button data-edit="account" :disabled="locked" @click="editor='account'"><span class="mini-icon">¥</span><strong>{{accountName}}</strong><small>账户</small></button>
        <button :disabled="locked" @click="router.push('/ledgers')"><AppIcon name="user" :size="18"/><strong>{{ledger?.name || '账本'}}</strong><small>切换账本</small></button>
        <button data-edit="note" :disabled="locked||type==='转账'" @click="editor='note'"><span class="mini-icon">⌁</span><strong>{{note || '添加备注'}}</strong><small>备注</small></button>
      </div>
      <div class="amount-line"><span class="chosen"><span class="chosen-icon">{{type==='转账'?'⇄':selectedCategory.icon}}</span>{{type==='转账'?'转账':selectedCategory.name}}</span><strong :class="{'is-long':state.display.length>8}">¥ {{state.display}}</strong></div>
      <div class="keypad">
        <button v-for="key in ['1','2','3','+','4','5','6','-','7','8','9']" :key="key" :class="{operator:key==='+'||key==='-'}" @click="press(key)">{{key==='+'?'＋':key==='-'?'－':key}}</button>
        <button class="done" :disabled="loading || !canWrite" @click="press('完成')">完成</button>
        <button @click="press('.')">.</button><button @click="press('0')">0</button><button aria-label="退格" @click="press('backspace')"><AppIcon name="backspace"/></button>
        <button class="again" :disabled="loading || !canWrite" @click="save(true)">保存并继续记一笔</button>
      </div>
    </section>
    <div v-if="editor" class="modal-backdrop" @click.self="editor=''"><section class="modal" role="dialog" aria-modal="true" aria-label="编辑记账信息"><h2>{{editor==='note'?'填写备注':editor==='date'?'记账时间':'选择账户'}}</h2><textarea v-if="editor==='note'" v-model="note" maxlength="500" aria-label="备注"></textarea><input v-if="editor==='date'" v-model="dateValue" type="datetime-local" aria-label="记账时间"><select v-if="editor==='account'" v-model="accountId" aria-label="账户"><option value="">请选择</option><option v-for="item in accounts" :key="item.id" :value="item.id">{{item.name}}</option></select><router-link v-if="editor==='account'" to="/accounts">管理账户</router-link><button class="primary" @click="editor=''">确定</button></section></div>
  </main>
</template>

<style scoped>
.entry-page{height:100dvh;display:grid;grid-template-rows:auto auto minmax(0,1fr) auto;overflow:hidden;background:#f7faf8;padding-top:var(--safe-top)}button{border:0;background:none}.entry-header{height:52px;display:grid;grid-template-columns:46px 1fr 46px;align-items:center;padding:0 8px}.entry-header h1{text-align:center;font-size:18px;margin:0}.close{font-size:28px;color:#738079}.more{letter-spacing:2px;color:#738079}.segment{display:flex;margin:0 16px 10px;padding:4px;background:#e8efeb;border-radius:14px}.segment button{flex:1;padding:8px;border-radius:11px;color:var(--walnut-muted)}.segment .active{background:#fff;color:var(--walnut-deep);font-weight:800;box-shadow:0 4px 12px rgba(0,0,0,.06)}
.category-panel{min-height:0;overflow-y:auto;border-bottom:1px solid var(--walnut-line);scrollbar-width:none}.category-title{position:sticky;top:0;z-index:2;display:flex;align-items:center;justify-content:space-between;padding:8px 18px;background:rgba(247,250,248,.95);backdrop-filter:blur(8px)}.category-title strong{font-size:14px}.category-title button{font-size:12px;color:var(--walnut-muted)}.category-title span{color:var(--walnut-green)}.category-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px 4px;padding:4px 12px 18px}.category{min-width:0;display:grid;place-items:center;gap:5px;padding:0;font-size:11px;color:var(--walnut-muted)}.category-icon,.chosen-icon{display:grid;place-items:center;background:#fff;border:1px solid var(--walnut-line)}.category-icon{width:47px;height:47px;border-radius:16px;font-size:21px;box-shadow:0 4px 13px rgba(31,72,52,.035)}.category.selected{color:var(--walnut-deep);font-weight:800}.category.selected .category-icon{border:2px solid var(--walnut-green);background:var(--walnut-mint);box-shadow:0 7px 18px rgba(32,164,109,.14)}
.entry-console{position:relative;background:#fff;box-shadow:0 -10px 28px rgba(20,62,44,.08);padding-bottom:var(--safe-bottom)}.saved{position:absolute;left:50%;top:-37px;transform:translateX(-50%);z-index:5;margin:0;padding:7px 14px;border-radius:99px;background:var(--walnut-deep);color:#fff;font-size:12px;white-space:nowrap}.quick-meta{height:58px;display:grid;grid-template-columns:repeat(4,1fr);border-bottom:1px solid var(--walnut-line)}.quick-meta button{display:grid;grid-template-columns:20px 1fr;grid-template-rows:1fr 1fr;column-gap:4px;align-items:end;text-align:left;padding:8px 5px;color:var(--walnut-deep)}.quick-meta svg,.mini-icon{grid-row:1/3;align-self:center}.quick-meta strong{font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.quick-meta small{color:var(--walnut-muted);font-size:9px}.mini-icon{font-weight:800}
.amount-line{height:66px;display:flex;align-items:center;justify-content:space-between;padding:8px 17px;border-bottom:1px solid var(--walnut-line)}.chosen{display:flex;align-items:center;gap:8px;color:var(--walnut-muted)}.chosen-icon{width:33px;height:33px;border-radius:11px;font-size:16px;background:var(--walnut-mint)}.amount-line>strong{font-size:30px;letter-spacing:-1px}.amount-line>strong.is-long{font-size:23px}.keypad{height:255px;display:grid;grid-template-columns:repeat(4,1fr);grid-template-rows:repeat(5,1fr);gap:1px;background:#e8eeea}.keypad button{background:#fff;font-size:21px}.keypad button:active{background:var(--walnut-mint)}.keypad .operator{font-size:18px;color:var(--walnut-deep);font-weight:800;background:#f5faf7}.keypad .done{grid-row:3/5;grid-column:4;background:linear-gradient(160deg,var(--walnut-green-2),var(--walnut-green));color:#fff;font-size:16px;font-weight:800}.keypad .again{grid-column:1/5;background:#eff9f4;color:var(--walnut-deep);font-size:13px;font-weight:800}
.orange{background:#fff3e9}.pink{background:#fff0f4}.blue{background:#edf4ff}.green{background:#eaf8f1}.purple{background:#f4efff}.red{background:#fff0f0}.cyan{background:#eaf8fa}.gold{background:#fff7df}.gray{background:#f1f3f2}@media(max-height:740px){.category-grid{gap:8px 3px}.category-icon{width:42px;height:42px}.keypad{height:228px}.quick-meta{height:52px}.amount-line{height:59px}}@media(max-width:340px){.category-icon{width:40px;height:40px}.category-grid{padding-inline:7px}.amount-line>strong{font-size:26px}}
</style>
