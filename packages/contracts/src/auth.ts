import { z } from 'zod'

const username = z.string().trim().min(3).max(32).regex(/^[a-zA-Z0-9_]+$/)
const password = z.string().min(12).max(128)

export const registerRequestSchema = z.object({
  invite_code: z.string().trim().min(4).max(64),
  username,
  password,
  device_name: z.string().trim().min(1).max(80),
})

export const loginRequestSchema = z.object({
  username,
  password: z.string().min(1).max(128),
  device_name: z.string().trim().min(1).max(80),
})

export const refreshRequestSchema = z.object({
  refresh_token: z.string().min(32).max(256),
})

export type RegisterRequest = z.infer<typeof registerRequestSchema>
export type LoginRequest = z.infer<typeof loginRequestSchema>
export type RefreshRequest = z.infer<typeof refreshRequestSchema>

export type AuthSession = {
  access_token: string
  refresh_token: string
  expires_in: number
  user: { id: string; username: string }
  device: { id: string; name: string }
}
