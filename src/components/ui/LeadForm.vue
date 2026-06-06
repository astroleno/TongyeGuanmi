<template>
  <GlassCard tone="warm">
    <view class="lead-form">
      <view class="lead-form__mode" v-if="isMockMode">
        <text class="lead-form__mode-dot" />
        <text>演示提交 / mock mode</text>
      </view>

      <view class="lead-form__field">
        <text class="lead-form__label">公司 / 身份</text>
        <input
          v-model="form.organization"
          class="lead-form__control"
          placeholder="企业、机构或个人身份"
          placeholder-class="lead-form__placeholder"
          @focus="emit('fieldFocus')"
          @blur="emit('fieldBlur')"
        />
      </view>

      <view class="lead-form__field">
        <text class="lead-form__label">联系人</text>
        <input
          v-model="form.name"
          class="lead-form__control"
          placeholder="姓名 / 称呼"
          placeholder-class="lead-form__placeholder"
          @focus="emit('fieldFocus')"
          @blur="emit('fieldBlur')"
        />
      </view>

      <view class="lead-form__field">
        <text class="lead-form__label">联系方式</text>
        <input
          v-model="form.contact"
          class="lead-form__control"
          placeholder="微信 / 手机 / 邮箱"
          placeholder-class="lead-form__placeholder"
          @focus="emit('fieldFocus')"
          @blur="emit('fieldBlur')"
        />
      </view>

      <view class="lead-form__field">
        <text class="lead-form__label">你关心的方向</text>
        <view class="lead-form__segments">
          <button
            v-for="option in directionOptions"
            :key="option.value"
            class="lead-form__segment"
            :class="{ 'lead-form__segment--active': form.direction === option.value }"
            @click="form.direction = option.value"
          >
            {{ option.label }}
          </button>
        </view>
      </view>

      <view class="lead-form__field">
        <text class="lead-form__label">你想解决的问题</text>
        <textarea
          v-model="form.need"
          class="lead-form__textarea"
          maxlength="300"
          placeholder="用一句话描述你的团队、业务或个人项目正在面对什么问题"
          placeholder-class="lead-form__placeholder"
          @focus="emit('fieldFocus')"
          @blur="emit('fieldBlur')"
        />
      </view>

      <view v-if="error" class="lead-form__error">{{ error }}</view>
      <view v-if="successLeadId" class="lead-form__success">已收到，我们会尽快联系你。</view>

      <CtaButton class="lead-form__submit" :label="submitting ? '提交中' : successLeadId ? '已提交' : '预约一次场景共创'" :disabled="submitting || !!successLeadId" @tap="$emit('submit')" />
    </view>
  </GlassCard>
</template>

<script setup lang="ts">
import CtaButton from '@/components/ui/CtaButton.vue'
import GlassCard from '@/components/ui/GlassCard.vue'
import { LEAD_API_MODE } from '@/config/runtime'
import type { LeadDirection, LeadFormState } from '@/types/lead'

defineProps<{
  form: LeadFormState
  submitting: boolean
  error: string
  successLeadId: string
}>()

const emit = defineEmits<{
  submit: []
  fieldFocus: []
  fieldBlur: []
}>()

const isMockMode = LEAD_API_MODE === 'mock'

const directionOptions: Array<{ value: LeadDirection; label: string }> = [
  { value: 'enterprise', label: '企业转型' },
  { value: 'agent', label: 'Agent 与画布' },
  { value: 'aigc', label: 'AIGC 视频' },
  { value: 'personal', label: '个人能力' },
  { value: 'other', label: '其他' }
]
</script>

<style scoped lang="scss">
.lead-form {
  display: block;
  padding: 36rpx;
}

.lead-form__mode {
  display: flex;
  align-items: center;
  gap: 10rpx;
  margin-bottom: 20rpx;
  color: rgba(233, 226, 210, .52);
  font-size: 19rpx;
}

.lead-form__mode-dot {
  width: 10rpx;
  height: 10rpx;
  border-radius: 10rpx;
  background: var(--c-acid-dot);
  box-shadow: 0 0 16rpx rgba(200, 242, 28, .48);
}

.lead-form__field {
  display: flex;
  flex-direction: column;
  gap: 14rpx;
  padding: 22rpx 0;
  border-bottom: 1rpx solid rgba(233, 226, 210, .12);
}

.lead-form__label {
  color: rgba(233, 226, 210, .52);
  font-size: 19rpx;
}

.lead-form__control,
.lead-form__textarea {
  width: 100%;
  color: var(--c-ivory);
  font-size: 23rpx;
  line-height: 1.58;
}

.lead-form__control {
  height: 64rpx;
  padding: 0 4rpx;
}

.lead-form__textarea {
  min-height: 152rpx;
  padding: 4rpx;
}

.lead-form__placeholder {
  color: rgba(233, 226, 210, .36);
}

.lead-form__segments {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}

.lead-form__segment {
  min-height: 56rpx;
  padding: 0 18rpx;
  border: 1rpx solid rgba(233, 226, 210, .13);
  border-radius: var(--r-control);
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(233, 226, 210, .58);
  background: rgba(233, 226, 210, .05);
  font-size: 19rpx;
  line-height: 1.28;
}

.lead-form__segment--active {
  color: #16130c;
  background: var(--c-ivory);
}

.lead-form__error,
.lead-form__success {
  margin: 22rpx 0;
  font-size: 21rpx;
  line-height: 1.5;
}

.lead-form__error {
  color: #f4b5a8;
}

.lead-form__success {
  color: var(--c-acid-dot);
}

.lead-form__submit {
  margin-top: 24rpx;
  width: 100%;
}
</style>
