export type UserRole = 'STUDENT' | 'FACULTY'
export type CycleStatus = 'DRAFT' | 'PUBLISHED' | 'CLOSED'

export interface User {
  id: string
  name: string
  email: string
  role: UserRole
  batchYear: number | null
}

export interface AuthResponse {
  accessToken: string
  user: User
}

export interface Cycle {
  id: string
  courseName: string
  title: string
  description: string | null
  batchYear: number
  semester: number
  academicYear: string
  submissionStartAt: string
  submissionDeadline: string
  status: CycleStatus
  publishedAt: string | null
  closedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface CycleInput {
  courseName: string
  title: string
  description?: string
  batchYear: number
  semester: number
  academicYear: string
  submissionStartAt: string
  submissionDeadline: string
}