<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api, useLedger, type Category } from '../../core/api/ledger-context'
import { expenseCategories, incomeCategories } from './categories'
const { ledger, error, loading, canManage, load, run } = useLedger()
const kind = ref<'expense'|'income'>('expense'), items = ref<Category[]>([])
const editing = ref(false), selected = ref<Category | null>(null), archiving = ref<Category | null>(null)
const name = ref(''), icon = ref('📦'), color = ref('#20a46d'), order = ref(0)
const visible = computed(() => items.value.filter(item => item.kind === kind.value))
async function refresh() { items.value = await api.get<Category[]>(`/ledgers/${ledger.value!.id}/categories`) }
onMounted(() => run(async () => { await load(); await refresh() }))
function edit(item: Category | null) {
  selected.value = item; name.value = item?.name ?? ''; icon.value = item?.icon ?? '📦'; color.value = item?.color ?? '#20a46d'; order.value = item?.sort_order ?? visible.value.length; editing.value = true
}
async function save() { await run(async () => {
  if (!name.value.trim()) throw new Error('请输入分类名称')
  if (items.value.some(item => item.id !== selected.value?.id && item.kind === kind.value && item.name === name.value.trim())) throw new Error('已有同名分类')
  const base = `/ledgers/${ledger.value!.id}/categories`
  await api.request(selected.value ? `${base}/${selected.value.id}` : base, { method: selected.value ? 'PATCH' : 'POST', body: JSON.stringify({ name: name.value.trim(), icon: icon.value, color: color.value, kind: kind.value, sort_order: order.value, ...(selected.value ? { version: selected.value.version } : {}) }) })
  editing.value = false; await refresh()
}) }
async function archive() { await run(async () => {
  await api.request(`/ledgers/${ledger.value!.id}/categories/${archiving.value!.id}`, { method: 'DELETE' })
  archiving.value = null; await refresh()
}) }
async function defaults() { await run(async () => {
  const body = [...expenseCategories.map(item => ({ name:item.name,icon:item.icon,color:'#20a46d',kind:'expense' })), ...incomeCategories.map(item => ({ name:item.name,icon:item.icon,color:'#20a46d',kind:'income' }))]
  items.value = await api.request<Category[]>(`/ledgers/${ledger.value!.id}/categories/batch`, { method:'POST',body:JSON.stringify(body) })
}) }
</script>
<template>
  <main class="page"><header class="page-title"><router-link to="/entry">‹ 返回记账</router-link><h1>分类管理</h1><p>{{ledger?.name}} · 归档不会删除历史账单</p></header>
    <p v-if="error" role="alert" class="error">{{error}}</p>
    <div class="toolbar"><button :aria-pressed="kind==='expense'" @click="kind='expense'">支出分类</button><button :aria-pressed="kind==='income'" @click="kind='income'">收入分类</button><button v-if="canManage" :disabled="loading" @click="edit(null)">新增分类</button><button v-if="canManage" :disabled="loading" @click="defaults">添加常用分类</button></div>
    <p v-if="loading" role="status">正在处理…</p><p v-if="!canManage && ledger">仅账本所有者可以管理分类。</p>
    <section class="card list"><article v-for="item in visible" :key="item.id" data-category-row class="list-row"><span>{{item.icon}} {{item.name}}</span><div v-if="canManage"><button :disabled="loading" @click="edit(item)">编辑</button><button :disabled="loading" @click="archiving=item">归档</button></div></article><p v-if="!visible.length && !loading">暂无分类，请添加常用分类。</p></section>
    <div v-if="editing" class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-label="编辑分类"><h2>{{selected?'编辑分类':'新增分类'}}</h2><form @submit.prevent="save"><label>名称<input v-model="name" name="name" maxlength="80" required></label><label>图标<input v-model="icon" maxlength="80" required></label><label>颜色<input v-model="color" type="color"></label><label v-if="selected">排序（较小的排在前面）<input v-model.number="order" type="number" min="0" max="100000" required></label><p v-if="error" role="alert" class="error">{{error}}</p><button class="primary" :disabled="loading">保存分类</button><button type="button" :disabled="loading" @click="editing=false">取消</button></form></section></div>
    <div v-if="archiving" class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-label="归档分类"><h2>归档「{{archiving.name}}」？</h2><p>将不再出现在记账选择中，旧账单仍保留关联。</p><button class="danger" :disabled="loading" @click="archive">确认归档</button><button :disabled="loading" @click="archiving=null">取消</button></section></div>
  </main>
</template>
