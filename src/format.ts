// 时间与金额格式化
import type { UsageTier, TierKey } from './types.js';
import { LIMITS } from './types.js';

// resetInSec → "5h 0m" / "3d 4h" 可读倒计时
export function fmtCountdown(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '--';
  const s = Math.floor(sec);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// 百分比 + 上限 → "$0.00/$12" 形式
export function usageDollars(tier: UsageTier | null, key: TierKey): string {
  if (!tier) return '-';
  const usd = (tier.usagePercent / 100) * LIMITS[key];
  return `$${usd.toFixed(2)}/$${LIMITS[key]}`;
}

export function pct(tier: UsageTier | null): number {
  return tier ? tier.usagePercent : 0;
}