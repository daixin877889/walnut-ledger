export type Env = {
  DB: D1Database
  FILES: R2Bucket
  ACCESS_TOKEN_SECRET: string
  PASSWORD_ITERATIONS: string
  ENVIRONMENT?: string
}
