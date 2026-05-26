import { LEAD_API_MODE } from '@/config/runtime'
import type { LeadPayload, LeadResult } from '@/types/lead'

const HTTP_ENDPOINT = import.meta.env.VITE_LEAD_API_ENDPOINT || ''

export async function submitLead(payload: LeadPayload): Promise<LeadResult> {
  if (LEAD_API_MODE === 'mock') {
    await wait(520)
    return {
      ok: true,
      leadId: `mock_${Date.now()}`,
      mode: 'mock'
    }
  }

  if (LEAD_API_MODE === 'unicloud') {
    try {
      const res = await uniCloud.callFunction({
        name: 'submitLead',
        data: payload
      })

      const result = res.result as { ok?: boolean; leadId?: string; code?: string; message?: string }
      if (result?.ok) {
        return {
          ok: true,
          leadId: result.leadId || `unicloud_${Date.now()}`,
          mode: 'unicloud'
        }
      }

      return {
        ok: false,
        code: 'SERVER_ERROR',
        message: result?.message || '暂时提交失败，请稍后重试',
        mode: 'unicloud'
      }
    } catch {
      return {
        ok: false,
        code: 'NETWORK_ERROR',
        message: '网络不稳定，请稍后重试',
        mode: 'unicloud'
      }
    }
  }

  if (!HTTP_ENDPOINT) {
    return {
      ok: false,
      code: 'SERVER_ERROR',
      message: '提交接口尚未配置，请切换 mock 或配置合法 request 域名',
      mode: 'http'
    }
  }

  try {
    const res = await uni.request({
      url: HTTP_ENDPOINT,
      method: 'POST',
      data: payload,
      header: {
        'Content-Type': 'application/json'
      }
    })

    const data = res.data as { ok?: boolean; leadId?: string; code?: string; message?: string }
    if (data?.ok) {
      return {
        ok: true,
        leadId: data.leadId || `lead_${Date.now()}`,
        mode: 'http'
      }
    }

    return {
      ok: false,
      code: normalizeErrorCode(data?.code),
      message: data?.message || '暂时提交失败，请稍后重试',
      mode: 'http'
    }
  } catch {
    return {
      ok: false,
      code: 'NETWORK_ERROR',
      message: '网络不稳定，请稍后重试',
      mode: 'http'
    }
  }
}

function normalizeErrorCode(value: unknown): LeadResult extends infer R ? 'VALIDATION_ERROR' | 'RATE_LIMITED' | 'NETWORK_ERROR' | 'SERVER_ERROR' : never {
  if (value === 'VALIDATION_ERROR') return 'VALIDATION_ERROR'
  if (value === 'RATE_LIMITED') return 'RATE_LIMITED'
  if (value === 'NETWORK_ERROR') return 'NETWORK_ERROR'
  return 'SERVER_ERROR'
}

function wait(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}
