export type ApiEnvelope<T> = {
  code: string
  message: string
  data: T
  request_id: string
}
