<template>
  <section class="page" data-module="formfield">
    <header class="page-head">
      <div>
        <h2>表单分析管理</h2>
        <p class="page-desc">分析表单填写的用户行为，诊断高放弃率和错误集中的字段。</p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openCreate">登记表单诊断</button>
        <button class="btn" type="button" @click="exportRows">导出表单分析清单</button>
      </div>
    </header>

    <div class="stat-row">
      <article v-for="item in stats" :key="item.label" class="stat-card">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ item.value }}</strong>
      </article>
    </div>

    <p class="status-legend">
      <span v-for="item in statusSummary" :key="item.status" class="legend-item">
        {{ item.status }}：{{ item.count }}
      </span>
    </p>

    <form class="filter-bar" @submit.prevent="reload">
      <label v-for="field in filterFields" :key="field" class="filter-item">
        <span>{{ field }}</span>
        <input v-model="filters[field]" :placeholder="`按${field}检索`" />
      </label>
      <button class="btn" type="submit">查询</button>
      <button class="btn ghost" type="button" @click="resetFilters">重置条件</button>
    </form>

    <table class="data-table">
      <thead>
        <tr>
          <th v-for="column in columns" :key="column">{{ column }}</th>
          <th>流失绝对量</th>
          <th>流失占比</th>
          <th>流失诊断来源</th>
          <th>当前状态</th>
          <th>可执行动作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="String(row.id)">
          <td v-for="column in columns" :key="column">{{ row[column] ?? '—' }}</td>
          <td>{{ lossOf(row).lossAbsolute }}</td>
          <td>{{ lossOf(row).lossRatio }}</td>
          <td>{{ lossOf(row).source }}</td>
          <td>{{ row.status }}</td>
          <td class="row-actions">
            <button
              v-for="action in actions"
              :key="action"
              class="link"
              type="button"
              @click="runAction(action, row)"
            >
              {{ action }}
            </button>
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td :colspan="columns.length + 5" class="empty-state">暂无表单分析数据，可先登记表单诊断</td>
        </tr>
      </tbody>
    </table>

    <p class="loss-note">
      表单侧读取与新生成报告同一诊断版本：流失绝对量、流失占比取自「漏斗表单流失诊断数据报告」，
      诊断报告编号与「漏斗表单流失诊断」来源一并保留；尚未生成报告的表单显示「待生成」。
    </p>

    <footer class="page-foot">
      <span>共 {{ total }} 条表单分析记录</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
    </footer>

    <FunnelFormDiagnosis perspective="form" @changed="reloadGenerated" />
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import {
  downloadEntries,
  listEntries,
  moduleMeta,
  runAction as applyAction,
} from '@/api/local-service'
import FunnelFormDiagnosis from '@/components/FunnelFormDiagnosis.vue'
import { formChecklist } from '@/data/diagnosis'
import type { LossChecklistRow } from '@/data/diagnosis'
import type { EntryRow } from '@/data/types'

const meta = moduleMeta('formfield')
const columns = ["诊断编号", "表单名称", "总字段数", "放弃字段", "错误字段", "平均填写秒", "放弃率", "优化方向"]
const actions = ["发起诊断", "确诊问题", "标记优化"]
const statuses = ["草稿", "诊断中", "已确诊", "已优化"]
const stats = [{"label": "表单诊断总数", "value": 0}, {"label": "已确诊问题", "value": 0}, {"label": "诊断中问题", "value": 0}]

const rows = ref<EntryRow[]>([])
const total = ref(0)
const errorMessage = ref('')
const filters = ref<Record<string, string>>({})
const filterFields = columns.slice(0, 3)
const statusSummary = computed(() =>
  statuses.map((status: string) => ({
    status,
    count: rows.value.filter((row) => String(row.status) === status).length,
  })),
)

// 表单分析清单的流失绝对量/流失占比：只从新生成的跨模块诊断报告读取。
const generated = ref<LossChecklistRow[]>([])

function lossOf(row: EntryRow) {
  const formNo = String(row['诊断编号'] ?? '')
  const report = generated.value.find((item) => item.formNo === formNo)
  return {
    lossAbsolute: report ? String(report.lossAbsolute) : '待生成',
    lossRatio: report ? `${(report.lossRatio * 100).toFixed(2)}%` : '待生成',
    source: report ? `${report.reportNo} · ${report.source}` : '尚未生成漏斗表单流失诊断报告',
  }
}

function reloadGenerated() {
  generated.value = formChecklist()
}

function resetFilters() {
  filters.value = {}
  reload()
}

function exportRows() {
  downloadEntries(meta.key)
}

function openCreate() {
  errorMessage.value = '表单诊断登记入口尚未接入审批流'
}

function runAction(action: string, row: EntryRow) {
  errorMessage.value = ''
  const result = applyAction(meta.key, Number(row.id), action)
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  reload()
}

function reload() {
  errorMessage.value = ''
  try {
    const payload = listEntries(meta.key, filters.value)
    rows.value = payload.items
    total.value = payload.total
    reloadGenerated()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '表单分析列表读取失败'
  }
}

onMounted(reload)
</script>
