/**
 * 跨模块诊断数据流：把待处理漏斗的步骤读数与表单诊断的放弃字段合成一份新的
 * 「漏斗表单流失诊断数据报告」。
 *
 * 业务约束（逐条落到实现）：
 * 1. 同一诊断版本只产生一份完整报告；两个字段争抢同一首要流失原因时，后到的请求被
 *    拦住，并保留字段证据（放弃字段、放弃量、证据完整度、证据说明）用于复核。
 * 2. 并发提交只保留一份新生成的报告，落败请求收到拒绝凭据（token + 拒绝码）。
 * 3. 表单分析的清单从新生成的报告读取「流失绝对量」「流失占比」，同时保留诊断报告与
 *    「漏斗表单流失诊断」来源；漏斗侧与表单侧共用本文件同一条跨模块数据流。
 * 4. 放弃字段与一步漏斗流失在同一次诊断中竞争归因时，有两种仲裁口径：
 *    - volume（流失量优先）：留下高流失字段的优先原因报告；
 *    - evidence（放弃证据完整度优先）：留下证据完整字段的原因组报告 + 次优字段清单。
 *    不论哪种口径，每个流失量只归入一个已确诊原因组，不能被拆分到两个原因里。
 */

import { SEED_FORM_DIAGNOSES, SEED_FUNNEL_REPORTS } from './diagnosis-seed'
import type { EntryRow } from './types'

export type Arbitration = 'volume' | 'evidence'

export type FunnelStep = {
  name: string
  entrants: number
  dropouts: number
  /** 该步流失量归入的原因组编号；同一流失量只能出现一次。 */
  attributedTo: string
}

export type FieldEvidence = {
  field: string
  /** 字段所在的漏斗步骤 */
  step: string
  /** 该字段的放弃量 */
  abandonments: number
  /** 主动填写放弃的用户占比 */
  abandonmentRate: number
  /** 放弃证据完整度 0-1 */
  evidenceScore: number
  errorCount: number
  /** 是否持有完整证据链 */
  complete: boolean
  reason: string
  evidenceNote: string
}

export type CauseGroup = {
  id: string
  label: string
  /** 该原因组对应的漏斗步骤 */
  step: string
  /** 归入该原因组的流失量 */
  volume: number
  /** 归入该原因组的字段 */
  fields: string[]
  evidenceScore: number
}

export type DiagnosisRequest = {
  requestId: string
  funnelId: string
  formId: string
  /** 表单侧读取的诊断版本，必须与漏斗侧一致 */
  version: string
  arbitration: Arbitration
}

export type RejectionCode =
  | 'PRIMARY_CAUSE_CONFLICT'
  | 'CONCURRENT_SUBMISSION'
  | 'VERSION_MISMATCH'
  | 'ATTRIBUTION_CONFLICT'

export type DiagnosisRejection = {
  requestId: string
  code: RejectionCode
  message: string
  /** 被拦住时保留的字段证据，便于复核 */
  retainedEvidence: FieldEvidence[]
  /** 拒绝凭据，可用于幂等重试与审计 */
  token: string
}

/** 字段级流失原因：报告的最小解释单元，责任字段 + 原因 + 证据强度。 */
export type FieldCause = {
  step: string
  field: string
  reason: string
  abandonments: number
  evidenceScore: number
  complete: boolean
  /** primary：首要原因组成员；runner-up：次优字段；supporting：其余步骤证据 */
  role: 'primary' | 'runner-up' | 'supporting'
}

export type GeneratedDiagnosisReport = {
  reportNo: string
  funnelId: string
  funnelName: string
  formId: string
  formName: string
  /** 漏斗与表单两侧读取的同一诊断版本 */
  version: string
  /** 报告来源，两个业务面共用 */
  source: '漏斗表单流失诊断'
  arbitration: Arbitration
  /** 流失绝对量与流失占比：表单分析清单从这里读取 */
  lossAbsolute: number
  lossRatio: number
  steps: FunnelStep[]
  fields: FieldEvidence[]
  /** 字段级流失原因 */
  fieldCauses: FieldCause[]
  primaryCause: CauseGroup
  causeGroups: CauseGroup[]
  /** 证据完整度优先口径下留存的次优字段 */
  runnerUpFields: string[]
  attributionIndex: Record<string, string>
  evidenceSignature: string
  createdAt: string
}

type PrimaryClaim = {
  reportNo: string
  requestId: string
  causeId: string
  step: string
  fields: string[]
}

type DiagnosisState = {
  reports: GeneratedDiagnosisReport[]
  rejections: DiagnosisRejection[]
  /** 每个诊断版本只允许一份完整报告 */
  versionOwners: Record<string, string>
  /** 每个漏斗步骤的首要流失原因只允许一个请求持有 */
  primaryOwners: Record<string, PrimaryClaim>
  /** 已落地的提交请求，用于识别并发重复提交 */
  submittedRequests: Record<string, string>
}

const STORAGE_KEY = 'behavior-event-trace-hub:diagnosis-v1'
const SOURCE = '漏斗表单流失诊断' as const

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

function emptyState(): DiagnosisState {
  return { reports: [], rejections: [], versionOwners: {}, primaryOwners: {}, submittedRequests: {} }
}

let cache: DiagnosisState | null = null

function readState(): DiagnosisState {
  if (typeof window === 'undefined' || !window.localStorage) {
    return emptyState()
  }
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    return emptyState()
  }
  try {
    const parsed = JSON.parse(raw) as Partial<DiagnosisState>
    return { ...emptyState(), ...parsed }
  } catch {
    return emptyState()
  }
}

function getState(): DiagnosisState {
  if (cache === null) {
    cache = readState()
  }
  return cache
}

function persist(next: DiagnosisState): void {
  cache = next
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }
}

/** 回到首次打开时的状态（清空已生成报告与拒绝记录）。 */
export function resetDiagnosisState(): void {
  persist(emptyState())
}

export function listFunnelSources() {
  return SEED_FUNNEL_REPORTS.map((item) => ({ id: item.reportNo, name: item.name, revision: item.revision }))
}

export function listFormSources() {
  return SEED_FORM_DIAGNOSES.map((item) => ({
    id: item.formNo,
    name: item.name,
    revision: item.revision,
    funnelNo: item.funnelNo,
  }))
}

export function funnelName(funnelId: string): string {
  return SEED_FUNNEL_REPORTS.find((item) => item.reportNo === funnelId)?.name ?? funnelId
}

/** 表单诊断归属的漏斗：两侧必须读同一漏斗、同一诊断版本。 */
export function formFunnelNo(formId: string): string {
  return SEED_FORM_DIAGNOSES.find((item) => item.formNo === formId)?.funnelNo ?? ''
}

/** 两个业务面共用的诊断版本：漏斗步骤与表单字段读同一份。 */
export function diagnosisVersion(funnelId: string, formId: string): string {
  const funnel = SEED_FUNNEL_REPORTS.find((item) => item.reportNo === funnelId)
  const form = SEED_FORM_DIAGNOSES.find((item) => item.formNo === formId)
  if (!funnel || !form) {
    throw new Error(`漏斗 ${funnelId} 或表单 ${formId} 没有登记诊断数据`)
  }
  return `diag-${funnelId}-${formId}-v${funnel.revision}.${form.revision}`
}

export function funnelSteps(funnelId: string): FunnelStep[] {
  const funnel = SEED_FUNNEL_REPORTS.find((item) => item.reportNo === funnelId)
  if (!funnel) {
    throw new Error(`没有找到漏斗诊断 ${funnelId}`)
  }
  return funnel.steps.map((step) => ({ ...step, attributedTo: '' }))
}

export function formFields(formId: string): FieldEvidence[] {
  const form = SEED_FORM_DIAGNOSES.find((item) => item.formNo === formId)
  if (!form) {
    throw new Error(`没有找到表单诊断 ${formId}`)
  }
  return clone(form.fields)
}

export function funnelCauseCategory(funnelId: string): string {
  return SEED_FUNNEL_REPORTS.find((item) => item.reportNo === funnelId)?.causeCategory ?? ''
}

function evidenceSignature(fields: FieldEvidence[], version: string): string {
  return [version, ...fields.map((field) => `${field.field}:${field.abandonments}:${field.evidenceScore}`)].join('|')
}

function nextReportNo(reports: GeneratedDiagnosisReport[]): string {
  const used = reports
    .map((item) => Number(item.reportNo.replace(/^FUNN-LOSS-/, '')))
    .filter((value) => Number.isFinite(value))
  const next = used.length ? Math.max(...used) + 1 : 1
  return `FUNN-LOSS-${String(next).padStart(4, '0')}`
}

export type SubmitOutcome =
  | { ok: true; report: GeneratedDiagnosisReport; message: string }
  | { ok: false; rejection: DiagnosisRejection; message: string }

function reject(
  current: DiagnosisState,
  request: DiagnosisRequest,
  code: RejectionCode,
  message: string,
  retainedEvidence: FieldEvidence[],
): SubmitOutcome {
  const rejection: DiagnosisRejection = {
    requestId: request.requestId,
    code,
    message,
    retainedEvidence: clone(retainedEvidence),
    token: `REJ-${code}-${request.requestId}-${current.rejections.length + 1}`,
  }
  persist({ ...current, rejections: [...current.rejections, rejection] })
  return { ok: false, rejection, message }
}

type AttributeResult =
  | {
      ok: true
      steps: FunnelStep[]
      fieldCauses: FieldCause[]
      causeGroups: CauseGroup[]
      primaryCause: CauseGroup
      runnerUpFields: string[]
      lossAbsolute: number
      lossRatio: number
    }
  | { ok: false; message: string }

/**
 * 把每一个流失量归入唯一原因组。放弃字段与单步流失在同一诊断里争抢归因时：
 * - volume：流失量更大的字段拿走该步流失量，形成优先原因报告；
 * - evidence：证据链完整的字段组成原因组，其余字段进入次优字段清单。
 */
function attributeLosses(
  steps: FunnelStep[],
  fields: FieldEvidence[],
  arbitration: Arbitration,
): AttributeResult {
  const stepNames = new Set<string>()
  for (const step of steps) {
    if (stepNames.has(step.name)) {
      return { ok: false, message: `步骤 ${step.name} 重复登记，流失量会被重复归因` }
    }
    stepNames.add(step.name)
  }

  for (const field of fields) {
    if (!stepNames.has(field.step)) {
      return { ok: false, message: `字段 ${field.field} 的放弃证据无法落到任何漏斗步骤` }
    }
  }

  const groups: CauseGroup[] = []
  const attributed: FunnelStep[] = []
  const runnerUpFields: string[] = []
  const fieldCauses: FieldCause[] = []

  for (const step of steps) {
    const candidates = fields.filter((field) => field.step === step.name)
    if (!candidates.length) {
      // 没有任何字段证据的一步流失：单独成组，保持「每个流失量只归入一个原因组」。
      const group: CauseGroup = {
        id: `cause-step-${step.name}`,
        label: `${step.name} 步骤流失`,
        step: step.name,
        volume: step.dropouts,
        fields: [],
        evidenceScore: 0,
      }
      groups.push(group)
      attributed.push({ ...step, attributedTo: group.id })
      continue
    }

    const ranked = [...candidates].sort((a, b) => {
      if (arbitration === 'volume') {
        return b.abandonments - a.abandonments || b.evidenceScore - a.evidenceScore
      }
      return b.evidenceScore - a.evidenceScore || b.abandonments - a.abandonments
    })
    const winner = ranked[0]
    const completeFields = ranked.filter((field) => field.complete).map((field) => field.field)
    const groupFields = arbitration === 'evidence' && completeFields.length ? completeFields : [winner.field]

    if (arbitration === 'evidence') {
      for (const field of ranked) {
        if (!groupFields.includes(field.field)) {
          runnerUpFields.push(field.field)
        }
      }
    }

    const group: CauseGroup = {
      id: `cause-${step.name}-${winner.field}`,
      label: arbitration === 'volume'
        ? `${winner.field} 高流失字段优先归因`
        : `${winner.field} 证据完整原因组（${groupFields.length} 个字段）`,
      step: step.name,
      volume: step.dropouts,
      fields: groupFields,
      evidenceScore: winner.evidenceScore,
    }
    groups.push(group)
    attributed.push({ ...step, attributedTo: group.id })
  }

  // 不变式：所有步骤流失量之和 = 各原因组流失量之和，且每个流失量只出现一次。
  const totalLoss = steps.reduce((sum, step) => sum + step.dropouts, 0)
  const grouped = groups.reduce((sum, group) => sum + group.volume, 0)
  const uniqueCauses = new Set(attributed.map((step) => step.attributedTo)).size
  if (totalLoss !== grouped || uniqueCauses !== attributed.length) {
    return { ok: false, message: '流失量归因不唯一：存在被拆分或重复计入的流失量' }
  }

  const primary = groups.reduce((best, group) => (group.volume > best.volume ? group : best), groups[0])
  for (const field of fields) {
    const group = groups.find((item) => item.step === field.step && item.fields.includes(field.field))
    const role: FieldCause['role'] = group
      ? group.id === primary.id
        ? 'primary'
        : 'supporting'
      : 'runner-up'
    fieldCauses.push({
      step: field.step,
      field: field.field,
      reason: field.reason,
      abandonments: field.abandonments,
      evidenceScore: field.evidenceScore,
      complete: field.complete,
      role,
    })
  }

  const entrants = steps.length ? steps[0].entrants : 0
  return {
    ok: true,
    steps: attributed,
    fieldCauses,
    causeGroups: groups,
    primaryCause: primary,
    runnerUpFields,
    lossAbsolute: totalLoss,
    lossRatio: entrants ? Number((totalLoss / entrants).toFixed(4)) : 0,
  }
}

export type ArbitrationPreview = {
  arbitration: Arbitration
  steps: FunnelStep[]
  fieldCauses: FieldCause[]
  causeGroups: CauseGroup[]
  primaryCause: CauseGroup
  runnerUpFields: string[]
  lossAbsolute: number
  lossRatio: number
}

/** 口径预览：不落库，用来在同一页并排查看两种仲裁各自留下什么。 */
export function previewArbitration(
  funnelId: string,
  formId: string,
  arbitration: Arbitration,
): ArbitrationPreview {
  const result = attributeLosses(funnelSteps(funnelId), formFields(formId), arbitration)
  if (!result.ok) {
    throw new Error(result.message)
  }
  return {
    arbitration,
    steps: result.steps,
    fieldCauses: result.fieldCauses,
    causeGroups: result.causeGroups,
    primaryCause: result.primaryCause,
    runnerUpFields: result.runnerUpFields,
    lossAbsolute: result.lossAbsolute,
    lossRatio: result.lossRatio,
  }
}

/**
 * 生成一份漏斗表单流失诊断数据报告。
 *
 * 校验顺序即仲裁顺序：
 * 1. 版本对齐 → 2. 同一请求重复提交 → 3. 同版本并发生成 → 4. 归因不变式 →
 * 5. 首要原因争抢 → 6. 落库。
 */
export function submitDiagnosis(request: DiagnosisRequest): SubmitOutcome {
  const current = getState()

  let version = ''
  try {
    version = diagnosisVersion(request.funnelId, request.formId)
  } catch (error) {
    return reject(
      current,
      request,
      'VERSION_MISMATCH',
      error instanceof Error ? error.message : '漏斗与表单诊断版本无法对齐',
      [],
    )
  }

  if (request.version !== version) {
    return reject(
      current,
      request,
      'VERSION_MISMATCH',
      `表单侧读取的版本 ${request.version} 与漏斗侧 ${version} 不一致，未生成报告`,
      formFields(request.formId),
    )
  }
  if (formFunnelNo(request.formId) !== request.funnelId) {
    return reject(
      current,
      request,
      'VERSION_MISMATCH',
      `表单 ${request.formId} 登记在漏斗 ${formFunnelNo(request.formId)} 下，不能读取 ${request.funnelId} 的诊断版本`,
      formFields(request.formId),
    )
  }

  const settled = current.submittedRequests[request.requestId]
  if (settled) {
    return reject(
      current,
      request,
      'CONCURRENT_SUBMISSION',
      `请求 ${request.requestId} 已生成报告 ${settled}，重复提交被拒绝`,
      formFields(request.formId),
    )
  }

  const versionOwner = current.versionOwners[version]
  if (versionOwner) {
    return reject(
      current,
      request,
      'CONCURRENT_SUBMISSION',
      `诊断版本 ${version} 已有报告 ${versionOwner}，并发提交只保留一份新生成的报告`,
      formFields(request.formId),
    )
  }

  const fields = formFields(request.formId)
  const attribution = attributeLosses(funnelSteps(request.funnelId), fields, request.arbitration)
  if (!attribution.ok) {
    return reject(current, request, 'ATTRIBUTION_CONFLICT', attribution.message, fields)
  }

  const claimKey = `${request.funnelId}:${attribution.primaryCause.step}`
  const claim = current.primaryOwners[claimKey]
  if (claim) {
    return reject(
      current,
      request,
      'PRIMARY_CAUSE_CONFLICT',
      `首要流失原因（${attribution.primaryCause.step}）已由报告 ${claim.reportNo} 的 ${claim.fields.join('、')} 确诊，` +
        `本次 ${attribution.primaryCause.fields.join('、')} 请求被拦住，字段证据已保留`,
      fields.filter((field) => field.step === attribution.primaryCause.step),
    )
  }

  const funnel = SEED_FUNNEL_REPORTS.find((item) => item.reportNo === request.funnelId)!
  const form = SEED_FORM_DIAGNOSES.find((item) => item.formNo === request.formId)!
  const report: GeneratedDiagnosisReport = {
    reportNo: nextReportNo(current.reports),
    funnelId: request.funnelId,
    funnelName: funnel.name,
    formId: request.formId,
    formName: form.name,
    version,
    source: SOURCE,
    arbitration: request.arbitration,
    lossAbsolute: attribution.lossAbsolute,
    lossRatio: attribution.lossRatio,
    steps: clone(attribution.steps),
    fields: clone(fields),
    fieldCauses: attribution.fieldCauses,
    primaryCause: attribution.primaryCause,
    causeGroups: attribution.causeGroups,
    runnerUpFields: attribution.runnerUpFields,
    attributionIndex: Object.fromEntries(attribution.steps.map((step) => [step.name, step.attributedTo])),
    evidenceSignature: evidenceSignature(fields, version),
    createdAt: new Date().toISOString(),
  }

  persist({
    ...current,
    reports: [...current.reports, report],
    versionOwners: { ...current.versionOwners, [version]: report.reportNo },
    primaryOwners: {
      ...current.primaryOwners,
      [claimKey]: {
        reportNo: report.reportNo,
        requestId: request.requestId,
        causeId: attribution.primaryCause.id,
        step: attribution.primaryCause.step,
        fields: attribution.primaryCause.fields,
      },
    },
    submittedRequests: { ...current.submittedRequests, [request.requestId]: report.reportNo },
  })
  return { ok: true, report: clone(report), message: `已生成 ${report.reportNo}，来源「${SOURCE}」` }
}

export function listGeneratedReports(): GeneratedDiagnosisReport[] {
  return clone(getState().reports)
}

export function listRejections(): DiagnosisRejection[] {
  return clone(getState().rejections)
}

export function findGeneratedReport(reportNo: string): GeneratedDiagnosisReport | null {
  const found = getState().reports.find((item) => item.reportNo === reportNo)
  return found ? clone(found) : null
}

/** 诊断版本是否已经被某份报告占用。 */
export function versionOwner(version: string): string | null {
  return getState().versionOwners[version] ?? null
}

/** 表单分析清单 / 漏斗诊断清单共用的行结构。 */
export type LossChecklistRow = {
  reportNo: string
  formNo: string
  formName: string
  funnelNo: string
  funnelName: string
  version: string
  source: string
  lossAbsolute: number
  lossRatio: number
  primaryCause: string
  primaryFields: string[]
  runnerUpFields: string[]
  arbitration: Arbitration
}

function toChecklistRow(report: GeneratedDiagnosisReport): LossChecklistRow {
  return {
    reportNo: report.reportNo,
    formNo: report.formId,
    formName: report.formName,
    funnelNo: report.funnelId,
    funnelName: report.funnelName,
    version: report.version,
    source: report.source,
    lossAbsolute: report.lossAbsolute,
    lossRatio: report.lossRatio,
    primaryCause: report.primaryCause.label,
    primaryFields: report.primaryCause.fields,
    runnerUpFields: report.runnerUpFields,
    arbitration: report.arbitration,
  }
}

/**
 * 表单分析清单的数据面：从新生成的报告读取流失绝对量与流失占比，
 * 同时带回诊断报告编号与「漏斗表单流失诊断」来源。
 */
export function formChecklist(formId?: string): LossChecklistRow[] {
  return listGeneratedReports()
    .filter((report) => !formId || report.formId === formId)
    .map(toChecklistRow)
}

/** 漏斗诊断入口的清单视图：与表单侧共用同一份报告数据。 */
export function funnelChecklist(funnelId?: string): LossChecklistRow[] {
  return listGeneratedReports()
    .filter((report) => !funnelId || report.funnelId === funnelId)
    .map(toChecklistRow)
}

/** 双端逐项比对：漏斗侧读源诊断，表单侧读新生成的报告。 */
export type ComparisonRow = {
  item: string
  funnelSide: string
  formSide: string
  aligned: boolean
}

export function compareSides(reportNo: string): ComparisonRow[] {
  const report = findGeneratedReport(reportNo)
  if (!report) {
    return []
  }
  const source = SEED_FUNNEL_REPORTS.find((item) => item.reportNo === report.funnelId)
  if (!source) {
    return []
  }

  const rows: ComparisonRow[] = []
  const push = (item: string, funnelSide: string, formSide: string, aligned: boolean) => {
    rows.push({ item, funnelSide, formSide, aligned })
  }

  push('诊断版本', report.version, report.version, true)
  push('诊断来源', SOURCE, report.source, report.source === SOURCE)

  const sourceLoss = source.steps.reduce((sum, step) => sum + step.dropouts, 0)
  const sourceEntrants = source.steps[0]?.entrants ?? 0
  const sourceRatio = sourceEntrants ? sourceLoss / sourceEntrants : 0
  push('流失绝对量合计', String(sourceLoss), String(report.lossAbsolute), sourceLoss === report.lossAbsolute)
  push(
    '流失占比合计',
    `${(sourceRatio * 100).toFixed(2)}%`,
    `${(report.lossRatio * 100).toFixed(2)}%`,
    Math.abs(sourceRatio - report.lossRatio) < 0.00005,
  )

  for (const step of source.steps) {
    const reported = report.steps.find((item) => item.name === step.name)
    const ratio = step.entrants ? (step.dropouts / step.entrants) * 100 : 0
    push(
      `${step.name} · 步骤分母`,
      String(step.entrants),
      reported ? String(reported.entrants) : '缺失',
      reported?.entrants === step.entrants,
    )
    push(
      `${step.name} · 流失绝对量`,
      String(step.dropouts),
      reported ? String(reported.dropouts) : '缺失',
      reported?.dropouts === step.dropouts,
    )
    push(
      `${step.name} · 流失占比`,
      `${ratio.toFixed(2)}%`,
      reported ? `${ratio.toFixed(2)}%` : '缺失',
      Boolean(reported),
    )
    const stepFields = report.fields.filter((field) => field.step === step.name)
    push(
      `${step.name} · 放弃字段`,
      stepFields.length ? `${stepFields.length} 个字段有放弃证据` : '无字段证据，按步骤流失归因',
      stepFields.length
        ? stepFields.map((field) => `${field.field}(${field.abandonments})`).join('、')
        : '—',
      true,
    )
  }

  const maxLossStep = source.steps.reduce(
    (best, step) => (step.dropouts > best.dropouts ? step : best),
    source.steps[0],
  )
  push(
    '首要原因',
    source.causeCategory,
    `${report.primaryCause.label} · ${report.primaryCause.fields.join('、') || '无字段证据'}`,
    report.primaryCause.step === maxLossStep?.name,
  )
  return rows
}

/** 供页面把报告映射成模块表格可渲染的 EntryRow 形态（不写模块存储）。 */
export function reportAsEntry(report: GeneratedDiagnosisReport): EntryRow {
  return {
    id: Number(report.reportNo.replace(/^FUNN-LOSS-/, '')) || 0,
    status: '已确诊',
    pending: false,
    abnormal: false,
    报告编号: report.reportNo,
    表单名称: report.formName,
    漏斗名称: report.funnelName,
    诊断版本: report.version,
    流失绝对量: report.lossAbsolute,
    流失占比: `${(report.lossRatio * 100).toFixed(2)}%`,
    首要流失原因: report.primaryCause.label,
    流失诊断来源: report.source,
  }
}
