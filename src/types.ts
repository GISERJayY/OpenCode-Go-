// 公共类型定义

// 单个账号配置
export interface Account {
  name: string;          // 展示名
  cookie: string;        // auth cookie 的 Value
  workspaceId: string;   // wrk_xxx
}

// 一档用量数据（5小时 / 每周 / 每月 共用此结构）
export interface UsageTier {
  status: string;        // 原样透传，实测为 "ok"
  resetInSec: number;    // 剩余重置秒数
  usagePercent: number;  // 百分比 0..100
}

// 单账号拉取结果
export interface UsageReport {
  ok: boolean;
  error?: string;        // 失败时的原因
  name: string;
  email?: string;
  workspaceId: string;
  rolling: UsageTier | null;   // 5小时档
  weekly: UsageTier | null;     // 每周档
  monthly: UsageTier | null;    // 每月档
}

// 整体配置
export interface Config {
  accounts: Account[];
  warn: number;   // 进度条变黄阈值，默认 80
  alert: number;  // 进度条变红阈值，默认 95
}

// 三档固定上限（美元），官方文档确认
export const LIMITS = {
  rolling: 12,
  weekly: 30,
  monthly: 60,
} as const;

export type TierKey = keyof typeof LIMITS;