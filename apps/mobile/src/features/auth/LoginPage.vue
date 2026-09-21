<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { currentSession } from '../../core/session/current-session'
import { AuthService } from './auth-service'
const username=ref(''),password=ref(''),error=ref(''),loading=ref(false),router=useRouter()
const api=import.meta.env.VITE_API_BASE_URL||'https://walnut-ledger-api.daixinmail.workers.dev/api/v1'
async function submit(){loading.value=true;error.value='';try{await new AuthService(api,currentSession).login({username:username.value,password:password.value,device_name:navigator.userAgent.slice(0,80)});await router.replace('/bills')}catch(e){error.value=e instanceof Error?e.message:'登录失败'}finally{loading.value=false}}
</script>
<template><main class="auth"><h1>登录核桃记账</h1><form @submit.prevent="submit"><label>用户名<input v-model="username" autocomplete="username" required minlength="3"></label><label>密码<input v-model="password" autocomplete="current-password" required type="password"></label><p v-if="error" role="alert">{{error}}</p><button :disabled="loading">{{loading?'登录中…':'登录'}}</button></form><router-link to="/register">使用邀请码注册</router-link></main></template>
<style scoped>.auth{max-width:420px;margin:10vh auto;padding:24px}.auth form,.auth label{display:grid;gap:12px}.auth label{gap:6px}.auth input,.auth button{min-height:48px;border:1px solid #d9ded5;border-radius:12px;padding:0 14px}.auth button{background:#718f4b;color:#fff;border:0;margin:8px 0 16px}</style>
