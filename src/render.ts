// 终端彩色表格 + 进度条渲染（手写 ANSI，避免依赖）
import type { UsageReport, UsageTier, TierKey } from './types.js';
import { LIMITS } from './types.js';
import { fmtCountdown, usageDollars, pct } from './format.js';

// ANSI 颜色
const C = {
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
};

const BAR_W = 16;

function bar(p: number, warn: number, alert: number): string {
  const filled = Math.min(BAR_W, Math.round((Math.min(p, 100) / 100) * BAR_W));
  const color = p >= alert ? C.red : p >= warn ? C.yellow : C.green;
  const inner = '█'.repeat(filled) + '░'.repeat(BAR_W - filled);
  return `${color(inner)} ${p.toFixed(0)}%`;
}

function tierCell(tier: UsageTier | null, key: TierKey, warn: number, alert: number): string {
  if (!tier) return C.dim('-');
  const p = tier.usagePercent;
  return [
    bar(p, warn, alert),
    `${usageDollars(tier, key)} ${C.dim('reset ' + fmtCountdown(tier.resetInSec))}`,
    C.dim('status=' + tier.status),
  ].join('\n');
}

// 计算字符串显示宽度（中文按 2 算近似）
function displayWidth(s: string): number {
  let w = 0;
  for (const ch of s) {
    w += /[　-鿿＀-￯]/.test(ch) ? 2 : 1;
  }
  return w;
}

function pad(s: string, width: number): string {
  const w = displayWidth(s);
  return w >= width ? s : s + ' '.repeat(width - w);
}

export function renderTable(reports: UsageReport[], warn: number, alert: number): string {
  const headers = ['账号', '邮箱', 'workspace', '5h档（$12）', '每周档（$30）', '每月档（$60）'];
  const rows: string[][] = reports.map((r) => {
    if (!r.ok) {
      return [
        C.bold(r.name),
        r.email ?? '-',
        r.workspaceId,
        C.red(r.error ?? '未知错误'),
        '',
        '',
      ];
    }
    return [
      C.bold(r.name),
      r.email ?? '-',
      r.workspaceId,
      tierCell(r.rolling, 'rolling', warn, alert),
      tierCell(r.weekly, 'weekly', warn, alert),
      tierCell(r.monthly, 'monthly', warn, alert),
    ];
  });

  // 取每列多行单元的首行宽度做列宽对齐（多行单元按最长行算）
  const colWidths = headers.map((h, i) => {
    let max = displayWidth(h);
    for (const row of rows) {
      const cell = row[i] ?? '';
      const lines = cell.split('\n');
      for (const ln of lines) max = Math.max(max, displayWidth(ln));
    }
    return max;
  });

  const line = (cells: string[]) =>
    cells.map((c, i) => pad(c, colWidths[i])).join(' │ ');

  const out: string[] = [];
  out.push(C.bold(C.cyan(line(headers))));
  out.push(colWidths.map((w) => '─'.repeat(w)).join('─┼─'));
  for (const row of rows) {
    // 多行单元按行展开，逐行对齐
    const cellLines = row.map((c) => c.split('\n'));
    const maxLines = Math.max(...cellLines.map((l) => l.length));
    for (let li = 0; li < maxLines; li++) {
      out.push(line(cellLines.map((lines) => lines[li] ?? '')));
    }
  }
  return out.join('\n');
}