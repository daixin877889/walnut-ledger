export const retryDelay=(attempt:number)=>Math.min(300000,[2000,5000,15000,60000][Math.min(attempt,3)]* (0.8+Math.random()*.4))
