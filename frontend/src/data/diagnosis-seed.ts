/**
 * 跨模块诊断的源数据：待处理漏斗的步骤读数 + 表单诊断的字段级放弃证据。
 *
 * 这些只是「漏斗侧步骤」与「表单侧字段」的输入；提交后生成的
 * 「漏斗表单流失诊断数据报告」由 diagnosis.ts 单独持久化，不覆盖模块自身的示例数据。
 */

export type FunnelStepSeed = {
  name: string
  entrants: number
  dropouts: number
}

export type FunnelDiagnosisSeed = {
  reportNo: string
  name: string
  revision: number
  causeCategory: string
  diagnosisDate: string
  steps: FunnelStepSeed[]
}

export type FormFieldSeed = {
  field: string
  step: string
  abandonments: number
  abandonmentRate: number
  evidenceScore: number
  errorCount: number
  /** 是否持有完整证据链（埋点日志 + 校验日志 + 网关回执） */
  complete: boolean
  reason: string
  evidenceNote: string
}

export type FormDiagnosisSeed = {
  formNo: string
  name: string
  revision: number
  funnelNo: string
  fields: FormFieldSeed[]
}

export const SEED_FUNNEL_REPORTS: FunnelDiagnosisSeed[] = [
  {
    reportNo: 'FUNN-0001',
    name: '下单转化漏斗',
    revision: 1,
    causeCategory: '收货地址步骤流失',
    diagnosisDate: '2026-09-01',
    steps: [
      { name: '购物车确认', entrants: 8000, dropouts: 960 },
      { name: '收货地址', entrants: 7040, dropouts: 1408 },
      { name: '支付方式', entrants: 5632, dropouts: 845 },
      { name: '支付确认', entrants: 4787, dropouts: 670 },
    ],
  },
  {
    reportNo: 'FUNN-0002',
    name: '注册转化漏斗',
    revision: 2,
    causeCategory: '验证码输入步骤流失',
    diagnosisDate: '2026-09-02',
    steps: [
      { name: '注册页浏览', entrants: 12000, dropouts: 2400 },
      { name: '手机号验证', entrants: 9600, dropouts: 1800 },
      { name: '验证码输入', entrants: 7800, dropouts: 2600 },
      { name: '设置密码', entrants: 5200, dropouts: 900 },
    ],
  },
  {
    reportNo: 'FUNN-0003',
    name: '搜索转化漏斗',
    revision: 1,
    causeCategory: '筛选条件步骤流失',
    diagnosisDate: '2026-09-03',
    steps: [
      { name: '搜索页进入', entrants: 15000, dropouts: 3000 },
      { name: '筛选条件', entrants: 12000, dropouts: 3600 },
      { name: '结果点击', entrants: 8400, dropouts: 2520 },
      { name: '详情浏览', entrants: 5880, dropouts: 1176 },
    ],
  },
]

export const SEED_FORM_DIAGNOSES: FormDiagnosisSeed[] = [
  {
    formNo: 'FORM-0001',
    name: '结算表单',
    revision: 2,
    funnelNo: 'FUNN-0001',
    fields: [
      {
        field: '优惠券',
        step: '购物车确认',
        abandonments: 620,
        abandonmentRate: 0.0775,
        evidenceScore: 0.72,
        errorCount: 140,
        complete: false,
        reason: '优惠券不可用提示滞后',
        evidenceNote: '优惠券校验接口日志缺失 28%',
      },
      {
        field: '收货地址',
        step: '收货地址',
        abandonments: 1150,
        abandonmentRate: 0.1634,
        evidenceScore: 0.94,
        errorCount: 310,
        complete: true,
        reason: '地址联想选择失败',
        evidenceNote: '地址联想埋点、校验日志、接口回执齐备',
      },
      {
        field: '手机号',
        step: '收货地址',
        abandonments: 220,
        abandonmentRate: 0.0313,
        evidenceScore: 0.81,
        errorCount: 60,
        complete: true,
        reason: '收货手机号校验失败',
        evidenceNote: '手机号校验日志完整',
      },
      {
        field: '支付方式',
        step: '支付方式',
        abandonments: 700,
        abandonmentRate: 0.1243,
        evidenceScore: 0.88,
        errorCount: 190,
        complete: true,
        reason: '支付方式受限提示不清',
        evidenceNote: '支付渠道回执与点击埋点齐备',
      },
    ],
  },
  {
    formNo: 'FORM-0002',
    name: '注册表单',
    revision: 3,
    funnelNo: 'FUNN-0002',
    fields: [
      {
        field: '昵称',
        step: '注册页浏览',
        abandonments: 380,
        abandonmentRate: 0.0317,
        evidenceScore: 0.5,
        errorCount: 120,
        complete: false,
        reason: '昵称重复提示不明确',
        evidenceNote: '昵称校验日志仅覆盖 50% 会话',
      },
      {
        field: '手机号',
        step: '手机号验证',
        abandonments: 1250,
        abandonmentRate: 0.1302,
        evidenceScore: 0.62,
        errorCount: 410,
        complete: false,
        reason: '手机号格式校验失败率高',
        evidenceNote: '手机号校验接口缺少失败码明细',
      },
      {
        field: '区号选择',
        step: '手机号验证',
        abandonments: 300,
        abandonmentRate: 0.0313,
        evidenceScore: 0.94,
        errorCount: 70,
        complete: true,
        reason: '区号列表过长导致选择困难',
        evidenceNote: '区号展开、搜索、选择三段埋点齐备',
      },
      {
        field: '短信验证码',
        step: '验证码输入',
        abandonments: 1900,
        abandonmentRate: 0.2436,
        evidenceScore: 0.66,
        errorCount: 620,
        complete: false,
        reason: '短信到达延迟或未收到',
        evidenceNote: '短信网关回执缺失 34%，无法闭链',
      },      {
        field: '图形验证码',
        step: '验证码输入',
        abandonments: 520,
        abandonmentRate: 0.0667,
        evidenceScore: 0.95,
        errorCount: 180,
        complete: true,
        reason: '图形验证码识别困难',
        evidenceNote: '图形验证码刷新、输入、重试埋点齐备',
      },
      {
        field: '语音验证码',
        step: '验证码输入',
        abandonments: 180,
        abandonmentRate: 0.0231,
        evidenceScore: 0.92,
        errorCount: 40,
        complete: true,
        reason: '语音验证码播报不可回放',
        evidenceNote: '语音验证码下发与收听回执齐备',
      },
      {
        field: '登录密码',
        step: '设置密码',
        abandonments: 620,
        abandonmentRate: 0.1192,
        evidenceScore: 0.71,
        errorCount: 230,
        complete: false,
        reason: '密码强度规则提示不足',
        evidenceNote: '密码强度提示曝光日志缺失 29%',
      },
      {
        field: '确认密码',
        step: '设置密码',
        abandonments: 180,
        abandonmentRate: 0.0346,
        evidenceScore: 0.9,
        errorCount: 50,
        complete: true,
        reason: '两次密码不一致提示缺失',
        evidenceNote: '确认密码校验与提示曝光日志完整',
      },
    ],
  },
  {
    formNo: 'FORM-0003',
    name: '筛选表单',
    revision: 2,
    funnelNo: 'FUNN-0003',
    fields: [
      {
        field: '关键词',
        step: '搜索页进入',
        abandonments: 2400,
        abandonmentRate: 0.16,
        evidenceScore: 0.9,
        errorCount: 300,
        complete: true,
        reason: '搜索无结果引导不足',
        evidenceNote: '搜索请求与结果曝光日志完整',
      },
      {
        field: '价格区间',
        step: '筛选条件',
        abandonments: 3100,
        abandonmentRate: 0.2583,
        evidenceScore: 0.82,
        errorCount: 520,
        complete: true,
        reason: '价格区间输入无效',
        evidenceNote: '价格输入校验日志与点击埋点齐备',
      },
      {
        field: '品牌多选',
        step: '筛选条件',
        abandonments: 900,
        abandonmentRate: 0.075,
        evidenceScore: 0.75,
        errorCount: 210,
        complete: true,
        reason: '品牌列表加载缓慢',
        evidenceNote: '品牌列表加载耗时与选择埋点齐备',
      },
      {
        field: '排序方式',
        step: '结果点击',
        abandonments: 1800,
        abandonmentRate: 0.2143,
        evidenceScore: 0.68,
        errorCount: 130,
        complete: false,
        reason: '排序切换无响应',
        evidenceNote: '排序切换接口日志缺失 32%',
      },
    ],
  },
  {
    // 与 FORM-0002 读同一漏斗、不同诊断版本：用于演示两个字段争抢同一首要流失原因。
    formNo: 'FORM-0004',
    name: '注册表单（短信渠道）',
    revision: 1,
    funnelNo: 'FUNN-0002',
    fields: [
      {
        field: '昵称',
        step: '注册页浏览',
        abandonments: 200,
        abandonmentRate: 0.0167,
        evidenceScore: 0.55,
        errorCount: 60,
        complete: false,
        reason: '昵称输入框缺少即时校验',
        evidenceNote: '昵称输入埋点缺失 45%',
      },
      {
        field: '手机号',
        step: '手机号验证',
        abandonments: 980,
        abandonmentRate: 0.1021,
        evidenceScore: 0.88,
        errorCount: 260,
        complete: true,
        reason: '手机号归属地校验失败',
        evidenceNote: '归属地校验与短信下发日志齐备',
      },
      {
        field: '短信验证码',
        step: '验证码输入',
        abandonments: 1650,
        abandonmentRate: 0.2115,
        evidenceScore: 0.72,
        errorCount: 540,
        complete: false,
        reason: '短信通道延迟',
        evidenceNote: '短信通道回执缺失 28%',
      },
      {
        field: '图形验证码',
        step: '验证码输入',
        abandonments: 300,
        abandonmentRate: 0.0385,
        evidenceScore: 0.8,
        errorCount: 90,
        complete: true,
        reason: '图形验证码刷新无反馈',
        evidenceNote: '刷新与重试埋点完整',
      },
      {
        field: '登录密码',
        step: '设置密码',
        abandonments: 410,
        abandonmentRate: 0.0788,
        evidenceScore: 0.7,
        errorCount: 120,
        complete: false,
        reason: '密码规则说明折叠',
        evidenceNote: '密码规则曝光日志缺失 30%',
      },
    ],
  },
]
