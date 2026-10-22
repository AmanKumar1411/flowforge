import { apiBaseUrl } from './config'
import type { AuthResponse, Cycle, CycleInput } from './types'

export class ApiError extends Error {
  readonly code?: string
  readonly status?: number

  constructor(message: string, code?: string, status?: number) {
    super(message)
    this.code = code
    this.status = status
  }
}

async function request<T>(path: string, token?: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })
  const body = (await response.json().catch(() => ({}))) as { message?: string; code?: string }
  if (!response.ok) throw new ApiError(body.message || 'The request could not be completed.', body.code, response.status)
  return body as T
}

export function login(email: string, password: string) {
  return request<AuthResponse>('/auth/login', undefined, { method: 'POST', body: JSON.stringify({ email, password }) })
}

export function listCycles(token: string) { return request<Cycle[]>('/course-cycles', token) }
export function listMyCycles(token: string) { return request<Cycle[]>('/course-cycles/my', token) }
export function getCycle(token: string, id: string) { return request<Cycle>(`/course-cycles/${id}`, token) }
export function createCycle(token: string, input: CycleInput) { return request<Cycle>('/course-cycles', token, { method: 'POST', body: JSON.stringify(input) }) }
export function updateCycle(token: string, id: string, input: Partial<CycleInput>) { return request<Cycle>(`/course-cycles/${id}`, token, { method: 'PATCH', body: JSON.stringify(input) }) }
export function publishCycle(token: string, id: string) { return request<Cycle>(`/course-cycles/${id}/publish`, token, { method: 'POST' }) }
export function closeCycle(token: string, id: string) { return request<Cycle>(`/course-cycles/${id}/close`, token, { method: 'POST' }) }