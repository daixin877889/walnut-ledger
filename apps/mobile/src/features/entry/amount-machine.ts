export type AmountState={display:string;storedCents:number|null;operator:'+'|'-'|null}
export const initialAmountState=():AmountState=>({display:'0',storedCents:null,operator:null})
const cents=(s:string)=>Math.round(Number(s)*100)
export function reduceAmount(state:AmountState,key:string):AmountState{
  if(key==='backspace') return {...state,display:state.display.length>1?state.display.slice(0,-1):'0'}
  if(key==='+'||key==='-') return {...state,storedCents:cents(state.display),operator:key,display:'0'}
  if(key==='='){if(state.storedCents===null||!state.operator)return state;const result=state.operator==='+'?state.storedCents+cents(state.display):state.storedCents-cents(state.display);return result>0?{display:(result/100).toFixed(2),storedCents:null,operator:null}:state}
  if(key==='.'&&state.display.includes('.'))return state
  if(!/^\d$/.test(key)&&key!=='.')return state
  const next=state.display==='0'&&key!=='.'?key:state.display+key; const fraction=next.split('.')[1]; if(fraction&&fraction.length>2)return state
  return {...state,display:next}
}
export const amountCents=(state:AmountState)=>cents(state.display)
