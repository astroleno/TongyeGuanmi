import { computed, reactive, ref } from 'vue'
import { submitLead } from '@/services/leadApi'
import type { LeadDirection, LeadFormState, LeadPayload, LeadResult } from '@/types/lead'

const initialState: LeadFormState = {
  organization: '',
  name: '',
  contact: '',
  need: '',
  direction: 'other'
}

export function useLeadForm() {
  const form = reactive<LeadFormState>({ ...initialState })
  const submitting = ref(false)
  const error = ref('')
  const successLeadId = ref('')
  const lastPayloadHash = ref('')
  const lastSubmittedAt = ref(0)

  const canSubmit = computed(() => !submitting.value && !successLeadId.value)

  function setDirection(direction: LeadDirection) {
    form.direction = direction
  }

  async function submit(sourceSceneId: string): Promise<LeadResult | null> {
    error.value = ''
    const validationError = validateLead(form)
    if (validationError) {
      error.value = validationError
      return null
    }

    const payload: LeadPayload = {
      organization: form.organization.trim(),
      name: form.name.trim(),
      contact: form.contact.trim(),
      need: form.need.trim(),
      direction: form.direction,
      sourceSceneId,
      submittedAt: new Date().toISOString()
    }

    const payloadHash = hashPayload(payload)
    const now = Date.now()
    if (payloadHash === lastPayloadHash.value && now - lastSubmittedAt.value < 8000) {
      error.value = '刚刚已经收到，请稍后再试'
      return {
        ok: false,
        code: 'RATE_LIMITED',
        message: error.value,
        mode: 'mock'
      }
    }

    submitting.value = true
    const result = await submitLead(payload)
    submitting.value = false

    if (result.ok) {
      successLeadId.value = result.leadId
      lastPayloadHash.value = payloadHash
      lastSubmittedAt.value = now
      return result
    }

    error.value = result.message
    return result
  }

  return {
    form,
    submitting,
    error,
    successLeadId,
    canSubmit,
    setDirection,
    submit
  }
}

function validateLead(form: LeadFormState) {
  const organization = form.organization.trim()
  const name = form.name.trim()
  const contact = form.contact.trim()
  const need = form.need.trim()

  if (organization.length < 2 || organization.length > 40) return '请填写 2-40 字的公司 / 身份'
  if (name.length < 1 || name.length > 20) return '请填写联系人'
  if (!isValidContact(contact)) return '请填写微信、手机或邮箱'
  if (need.length < 10 || need.length > 300) return '请用 10-300 字描述你的需求'
  return ''
}

function isValidContact(value: string) {
  const mobile = /^1[3-9]\d{9}$/
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  const wechat = /^[a-zA-Z][-_a-zA-Z0-9]{5,19}$/
  return mobile.test(value) || email.test(value) || wechat.test(value)
}

function hashPayload(payload: LeadPayload) {
  return [
    payload.organization,
    payload.name,
    payload.contact,
    payload.need,
    payload.direction,
    payload.sourceSceneId
  ].join('|')
}
