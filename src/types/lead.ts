export type LeadDirection = 'enterprise' | 'agent' | 'aigc' | 'personal' | 'other'

export type LeadPayload = {
  organization: string
  name: string
  contact: string
  need: string
  direction: LeadDirection
  sourceSceneId: string
  submittedAt: string
}

export type LeadResult =
  | {
      ok: true
      leadId: string
      mode: 'mock' | 'unicloud' | 'http'
    }
  | {
      ok: false
      code: 'VALIDATION_ERROR' | 'RATE_LIMITED' | 'NETWORK_ERROR' | 'SERVER_ERROR'
      message: string
      mode: 'mock' | 'unicloud' | 'http'
    }

export type LeadFormState = {
  organization: string
  name: string
  contact: string
  need: string
  direction: LeadDirection
}
