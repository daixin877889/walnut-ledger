export async function hapticTap(platform:{impact?:()=>Promise<void>}){try{await platform.impact?.()}catch{/* unsupported */}}
