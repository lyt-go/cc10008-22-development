<template>
  <section class="diag-flow" :data-perspective="perspective" data-module="funnel-form-diagnosis">
    <header class="diag-head">
      <div>
        <h3>{{ perspective === 'form' ? '表单侧 · 漏斗表单流失诊断' : '漏斗侧 · 漏斗表单流失诊断' }}</h3>
        <p class="diag-desc">
          读取待处理漏斗的步骤分母与表单诊断的字段级放弃证据，归因成一份新的
          「漏斗表单流失诊断数据报告」。漏斗侧与表单侧共用同一诊断版本与同一条跨模块数据流：
          任一侧生成报告后，另一侧的表单分析清单立即从报告读取流失绝对量与流失占比。
        </p>
      </div>
      <button class="btn ghost" type="button" @click="clearDiagnosis">清空跨模块诊断数据</button>
    </header>

    <div class="diag-controls">
      <label class="diag-field">
        <span>漏斗诊断</span>
        <select v-model="selectedFunnel">
          <option v-for="item in funnelSources" :key="item.id" :value="item.id">
            {{ item.id }} · {{ item.name }}
          </option>
        </select>
      </label>
      <label class="diag-field">
        <span>表单诊断</span>
        <select v-model="selectedForm">
          <option v-for="item in formSources" :key="item.id" :value="item.id">
            {{ item.id }} · {{ item.name }}
          </option>
        </select>
      </label>
      <label class="diag-field">
        <span>归因仲裁口径</span>
        <select v-model="arbitration">
          <option value="evidence">放弃证据完整度优先</option>
          <option value="volume">流失量优先</option>
        </select>
      </label>
      <button class="btn primary" type="button" @click="submit">生成漏斗表单流失诊断报告</button>
      <button class="btn" type="button" @click="submitConcurrent">并发生成同一版本</button>
      <button class="btn" type="button" @click="submitRival">另一表单争抢首要原因</button>
    </div>

    <p class="diag-version">
      两侧读取同一诊断版本：
      <code v-if="version">{{ version }}</code>
      <span v-else class="error-text">版本不可对齐</span>
      <span v-if="versionOwnerNo" class="diag-owner">已被报告 {{ versionOwnerNo }} 占用</span>
      <span v-if="crossFunnel" class="error-text">
        表单 {{ selectedForm }} 登记在漏斗 {{ formFunnel(selectedForm) }} 下，与所选漏斗不一致
      </span>
    </p>

    <p v-if="submitMessage" class="diag-message" :class="{ 'error-text': !submitOk }">
      {{ submitMessage }}
    </p>

    <div class="diag-columns">
      <article v-for="preview in previews" :key="preview.arbitration" class="diag-card">
        <header class="diag-card-head">
          <strong>{{ preview.arbitration === 'volume' ? '流失量优先（预览）' : '放弃证据完整度优先（预览）' }}</strong>
          <span>{{ preview.primaryCause.step }} · {{ preview.primaryCause.volume }} 流失</span>
        </header>
        <p class="diag-card-line">首要原因：{{ preview.primaryCause.label }}</p>
        <p class="diag-card-line">原因组成员：{{ preview.primaryCause.fields.join('、') || '无字段证据' }}</p>
        <p class="diag-card-line">
          次优字段：{{ preview.runnerUpFields.length ? preview.runnerUpFields.join('、') : '—' }}
        </p>
        <p class="diag-card-line">
          流失绝对量 {{ preview.lossAbsolute }} · 流失占比 {{ (preview.lossRatio * 100).toFixed(2) }}%
        </p>
        <p class="diag-card-line">
          字段级流失原因：
          <template v-for="(cause, index) in preview.fieldCauses" :key="`${cause.step}-${cause.field}`">
            <span v-if="index">；</span>{{ cause.field }} → {{ cause.reason }}（{{ roleLabel(cause.role) }}）
          </template>
        </p>
        <ul class="diag-group-list">
          <li v-for="group in preview.causeGroups" :key="group.id">
            {{ group.step }} → {{ group.id }}（{{ group.volume }} 流失，字段：{{ group.fields.join('、') || '步骤级' }}）
          </li>
        </ul>
      </article>
    </div>

    <h4 class="diag-section-title">新生成的漏斗表单流失诊断数据报告</h4>
    <table class="data-table">
      <thead>
        <tr>
          <th>报告编号</th>
          <th>诊断报告</th>
          <th>流失诊断来源</th>
          <th>诊断版本</th>
          <th>流失绝对量</th>
          <th>流失占比</th>
          <th>首要流失原因</th>
          <th>字段级流失原因</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="report in reports" :key="report.reportNo">
          <td>{{ report.reportNo }}</td>
          <td>{{ report.funnelNo }} / {{ report.formNo }}</td>
          <td>{{ report.source }}</td>
          <td>{{ report.version }}</td>
          <td>{{ report.lossAbsolute }}</td>
          <td>{{ (report.lossRatio * 100).toFixed(2) }}%</td>
          <td>{{ report.primaryCause }}</td>
          <td class="diag-causes">{{ report.fieldCauseText }}</td>
          <td>
            <button class="link" type="button" @click="activeReportNo = report.reportNo">双端逐项比对</button>
          </td>
        </tr>
        <tr v-if="!reports.length">
          <td colspan="9" class="empty-state">
            暂无漏斗表单流失诊断报告，先选好漏斗与表单后生成
          </td>
        </tr>
      </tbody>
    </table>

    <template v-if="activeReport">
      <h4 class="diag-section-title">
        双端逐项比对 · {{ activeReport.reportNo }}
        <span class="diag-sub">（漏斗侧读源诊断，表单侧读新生成的报告）</span>
      </h4>
      <table class="data-table">
        <thead>
          <tr><th>比对项</th><th>漏斗侧</th><th>表单侧</th><th>是否对齐</th></tr>
        </thead>
        <tbody>
          <tr v-for="row in comparisons" :key="row.item">
            <td>{{ row.item }}</td>
            <td>{{ row.funnelSide }}</td>
            <td>{{ row.formSide }}</td>
            <td :class="row.aligned ? 'diag-ok' : 'error-text'">{{ row.aligned ? '已对齐' : '待核' }}</td>
          </tr>
        </tbody>
      </table>

      <h4 class="diag-section-title">字段级流失原因与证据</h4>
      <table class="data-table">
        <thead>
          <tr><th>漏斗步骤</th><th>放弃字段</th><th>流失原因</th><th>放弃量</th><th>证据完整度</th><th>归因角色</th><th>证据说明</th></tr>
        </thead>
        <tbody>
          <tr v-for="cause in activeReport.fieldCauses" :key="`${cause.step}-${cause.field}`">
            <td>{{ cause.step }}</td>
            <td>{{ cause.field }}</td>
            <td>{{ cause.reason }}</td>
            <td>{{ cause.abandonments }}</td>
            <td>{{ (cause.evidenceScore * 100).toFixed(0) }}%{{ cause.complete ? '（完整）' : '（缺口）' }}</td>
            <td>{{ roleLabel(cause.role) }}</td>
            <td>{{ evidenceOf(cause.field) }}</td>
          </tr>
        </tbody>
      </table>
    </template>

    <h4 class="diag-section-title">被拦住的请求与保留的字段证据</h4>
    <table class="data-table">
      <thead>
        <tr><th>请求</th><th>拒绝码</th><th>拒绝凭据</th><th>原因</th><th>保留字段证据</th></tr>
      </thead>
      <tbody>
        <tr v-for="rejection in rejections" :key="rejection.token">
          <td>{{ rejection.requestId }}</td>
          <td>{{ rejection.code }}</td>
          <td><code>{{ rejection.token }}</code></td>
          <td>{{ rejection.message }}</td>
          <td>{{ rejection.retainedEvidence.map((field) => `${field.field}(${field.abandonments}/证据${(field.evidenceScore * 100).toFixed(0)}%)`).join('、') || '—' }}</td>
        </tr>
        <tr v-if="!rejections.length">
          <td colspan="5" class="empty-state">暂无被拦住的请求</td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import {
  compareSides,
  diagnosisVersion,
  formFunnelNo,
  listFormSources,
  listFunnelSources,
  listGeneratedReports,
  listRejections,
  previewArbitration,
  resetDiagnosisState,
  submitDiagnosis,
  versionOwner,
} from '@/data/diagnosis'
import type { Arbitration, FieldCause } from '@/data/diagnosis'

const props = withDefaults(
  defineProps<{
    perspective: 'funnel' | 'form'
    defaultFunnelId?: string
    defaultFormId?: string
  }>(),
  { defaultFunnelId: 'FUNN-0002', defaultFormId: 'FORM-0002' },
)

// 报告生成或清空后通知宿主页面刷新清单（表单侧据此重读流失绝对量/流失占比）。
const emit = defineEmits<{ (event: 'changed', payload: { reportNo: string | null }): void }>()

const funnelSources = listFunnelSources()
const formSources = listFormSources()

const selectedFunnel = ref(props.defaultFunnelId)
const selectedForm = ref(props.defaultFormId)
const arbitration = ref<Arbitration>('evidence')
const submitMessage = ref('')
const submitOk = ref(true)
const activeReportNo = ref('')
const requestSeq = ref(0)

const version = computed(() => {
  try {
    return diagnosisVersion(selectedFunnel.value, selectedForm.value)
  } catch {
    return ''
  }
})
const crossFunnel = computed(
  () => Boolean(formFunnelNo(selectedForm.value)) && formFunnelNo(selectedForm.value) !== selectedFunnel.value,
)
const versionOwnerNo = computed(() => (version.value ? versionOwner(version.value) : null))

watch([selectedFunnel, selectedForm], () => {
  submitMessage.value = ''
  submitOk.value = true
})

function formFunnel(formId: string) {
  return formFunnelNo(formId)
}

function nextRequestId(prefix: string) {
  requestSeq.value += 1
  return `${prefix}-${Date.now().toString(36)}-${requestSeq.value}`
}

const previews = computed(() => {
  if (!version.value || crossFunnel.value) {
    return []
  }
  try {
    return [
      previewArbitration(selectedFunnel.value, selectedForm.value, 'evidence'),
      previewArbitration(selectedFunnel.value, selectedForm.value, 'volume'),
    ]
  } catch {
    return []
  }
})

const reportRows = ref(listGeneratedReports())
const rejectionRows = ref(listRejections())

const reports = computed(() =>
  reportRows.value
    .filter((report) =>
      props.perspective === 'form'
        ? report.formId === selectedForm.value
        : report.funnelId === selectedFunnel.value,
    )
    .map((report) => ({
      reportNo: report.reportNo,
      funnelNo: report.funnelId,
      formNo: report.formId,
      source: report.source,
      version: report.version,
      lossAbsolute: report.lossAbsolute,
      lossRatio: report.lossRatio,
      primaryCause: `${report.primaryCause.label}（${report.primaryCause.step}）`,
      fieldCauseText: report.fieldCauses
        .map((cause) => `${cause.field}：${cause.reason}`)
        .join('；'),
    }))
    .reverse(),
)

const rejections = computed(() => [...rejectionRows.value].reverse())

const activeReport = computed(() => {
  const found = reportRows.value.find((report) => report.reportNo === activeReportNo.value)
  return found ?? null
})
const comparisons = computed(() => (activeReport.value ? compareSides(activeReport.value.reportNo) : []))

function evidenceOf(fieldName: string) {
  const field = activeReport.value?.fields.find((item) => item.field === fieldName)
  return field?.evidenceNote ?? '—'
}

function roleLabel(role: FieldCause['role']) {
  if (role === 'primary') return '首要原因组'
  if (role === 'runner-up') return '次优字段'
  return '步骤证据'
}

function refresh() {
  reportRows.value = listGeneratedReports()
  rejectionRows.value = listRejections()
  if (activeReportNo.value && !reportRows.value.some((report) => report.reportNo === activeReportNo.value)) {
    activeReportNo.value = ''
  }
}

function notifyChanged(reportNo: string | null) {
  emit('changed', { reportNo })
}

function submit() {
  const outcome = submitDiagnosis({
    requestId: nextRequestId('req'),
    funnelId: selectedFunnel.value,
    formId: selectedForm.value,
    version: version.value,
    arbitration: arbitration.value,
  })
  submitOk.value = outcome.ok
  submitMessage.value = outcome.ok
    ? outcome.message
    : `${outcome.rejection.code}：${outcome.rejection.message}（凭据 ${outcome.rejection.token}）`
  if (outcome.ok) {
    activeReportNo.value = outcome.report.reportNo
    notifyChanged(outcome.report.reportNo)
  }
  refresh()
}

/** 并发提交：同一版本、同一请求体立刻再发一次，只保留第一个生成的报告。 */
function submitConcurrent() {
  const requestId = nextRequestId('req')
  const request = {
    requestId,
    funnelId: selectedFunnel.value,
    formId: selectedForm.value,
    version: version.value,
    arbitration: arbitration.value,
  }
  const first = submitDiagnosis(request)
  const second = submitDiagnosis({ ...request, requestId: `${requestId}-dup` })
  submitOk.value = first.ok && !second.ok
  if (first.ok && !second.ok) {
    submitMessage.value =
      `首个请求已生成 ${first.report.reportNo}，并发请求收到拒绝凭据 ${second.rejection.token}`
    activeReportNo.value = first.report.reportNo
    notifyChanged(first.report.reportNo)
  } else if (!first.ok) {
    submitMessage.value = `${first.rejection.code}：${first.rejection.message}（凭据 ${first.rejection.token}）`
  } else {
    submitMessage.value = '并发提交未被拦住，请检查诊断版本状态'
  }
  refresh()
}

/** 另一表单在同一漏斗上争抢首要流失原因：后到请求被拦住并保留字段证据。 */
function submitRival() {
  const rivalForm = formSources.find((item) => item.id !== selectedForm.value && item.funnelNo === selectedFunnel.value)
  if (!rivalForm) {
    submitOk.value = false
    submitMessage.value = `漏斗 ${selectedFunnel.value} 下没有第二个表单可用于争抢首要原因演示`
    return
  }
  const rivalVersion = diagnosisVersion(selectedFunnel.value, rivalForm.id)
  const outcome = submitDiagnosis({
    requestId: nextRequestId('rival'),
    funnelId: selectedFunnel.value,
    formId: rivalForm.id,
    version: rivalVersion,
    arbitration: 'volume',
  })
  submitOk.value = outcome.ok
  submitMessage.value = outcome.ok
    ? `另一表单 ${rivalForm.id} 也生成了报告 ${outcome.report.reportNo}（未发生首要原因争抢）`
    : `${outcome.rejection.code}：${outcome.rejection.message}（凭据 ${outcome.rejection.token}）`
  if (outcome.ok) {
    activeReportNo.value = outcome.report.reportNo
    notifyChanged(outcome.report.reportNo)
  }
  refresh()
}

function clearDiagnosis() {
  resetDiagnosisState()
  activeReportNo.value = ''
  submitMessage.value = '跨模块诊断数据已清空，可重新生成报告'
  submitOk.value = true
  notifyChanged(null)
  refresh()
}

refresh()
</script>

<style scoped>
.diag-flow { margin-top: 28px; border-top: 1px solid var(--border); padding-top: 16px; }
.diag-head { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; }
.diag-head h3 { margin: 0 0 4px; }
.diag-desc { color: var(--muted); font-size: 13px; margin: 0 0 12px; max-width: 820px; }
.diag-controls { display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-end; margin-bottom: 8px; }
.diag-field span { display: block; font-size: 12px; color: var(--muted); margin-bottom: 4px; }
.diag-field select { padding: 6px 8px; border: 1px solid var(--border); border-radius: 6px; background: #fff; min-width: 180px; }
.diag-version { font-size: 12px; color: var(--muted); margin: 4px 0 8px; }
.diag-owner { margin-left: 10px; color: var(--brand); }
.diag-message { font-size: 13px; background: #eef6ff; border: 1px solid #cfe2ff; border-radius: 6px; padding: 8px 10px; }
.diag-columns { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 12px; margin: 12px 0; }
.diag-card { background: #fff; border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; }
.diag-card-head { display: flex; justify-content: space-between; gap: 8px; font-size: 13px; }
.diag-card-line { margin: 6px 0 0; font-size: 12px; color: #334155; }
.diag-group-list { margin: 8px 0 0; padding-left: 16px; font-size: 12px; color: var(--muted); }
.diag-section-title { margin: 18px 0 8px; font-size: 14px; }
.diag-sub { font-weight: 400; color: var(--muted); font-size: 12px; }
.diag-causes { max-width: 360px; font-size: 12px; color: #334155; }
.diag-ok { color: #0f7b3f; }
</style>
