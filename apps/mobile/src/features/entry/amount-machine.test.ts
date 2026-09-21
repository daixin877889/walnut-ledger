import { describe,expect,it } from 'vitest';import{initialAmountState,reduceAmount}from'./amount-machine'
describe('amount machine',()=>{it.each([[['1','2','.','3','4'],'12.34'],[['1','0','+','2','='],'12.00'],[['5','-','2','='],'3.00'],[['1','2','backspace'],'1']])('%j => %s',(keys,expected)=>expect((keys as string[]).reduce(reduceAmount,initialAmountState()).display).toBe(expected))})
