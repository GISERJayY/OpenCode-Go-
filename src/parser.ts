// 从 go 页 HTML 中提取三档 usage / 邮箱 / workspace 列表
import type { UsageTier } from './types.js';

// 三档 usage 在 HTML 里形如：rollingUsage:$R[35]={status:"ok",resetInSec:18000,usagePercent:0}
// billing.get 段里另有 monthlyUsage:null / monthlyLimit:null，会干扰简单 indexOf。
// 因此用正则定位 "rollingUsage:$R[N]={" 这种带 $R 引用前缀的位置。
function extractTierByKey(html: string, key: string): UsageTier | null {
  // 匹配 key:$R[数字]={ 之后到匹配 } 为止
  const re = new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ':\\$R\\[\\d+\\]=\\{');
  const m = re.exec(html);
  if (!m) return null;
  const start = m.index + m[0].length - 1; // 指向 '{'
  // 平衡花括号
  let depth = 0;
  for (let i = start; i < html.length; i++) {
    const c = html[i];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) {
      const obj = html.slice(start, i + 1);
      const status = obj.match(/status:\s*"([^"]*)"/)?.[1] ?? 'ok';
      const resetInSec = Number(obj.match(/resetInSec:\s*(\d+)/)?.[1] ?? 0);
      const usagePercent = Number(obj.match(/usagePercent:\s*(\d+(?:\.\d+)?)/)?.[1] ?? 0);
      if (!Number.isFinite(resetInSec) || !Number.isFinite(usagePercent)) return null;
      return { status, resetInSec, usagePercent };
    } }
  }
  return null;
}

export interface ParseResult {
  rolling: UsageTier | null;
  weekly: UsageTier | null;
  monthly: UsageTier | null;
  email?: string;
  workspaces?: { id: string; name: string }[];
}

export function parseUsage(html: string): ParseResult {
  const rolling = extractTierByKey(html, 'rollingUsage');
  const weekly = extractTierByKey(html, 'weeklyUsage');
  const monthly = extractTierByKey(html, 'monthlyUsage');

  // 邮箱：email 数据绑定形如 $R[28]($R[1],"xxx@xxx") —— 找紧邻的 "字符@字符"
  const email = html.match(/\$R\[\d+\]\(\$R\[\d+\],"([^"]+@[^"]+)"\)/)?.[1];

  // workspace 列表：workspaces[]=[$R[N]={id:"wrk_xxx",name:"...",slug:null}]
  const workspaces: { id: string; name: string }[] = [];
  const wsMatch = html.match(/workspaces\[\][^]*?\[\$R\[\d+\]=\{(id:"wrk_[A-Za-z0-9_]+",name:"[^"]*",slug:null)\}/);
  if (wsMatch) {
    const inner = wsMatch[1];
    const id = inner.match(/id:"(wrk_[A-Za-z0-9_]+)"/)?.[1];
    const name = inner.match(/name:"([^"]*)"/)?.[1];
    if (id) workspaces.push({ id, name: name ?? '' });
  }

  return { rolling, weekly, monthly, email, workspaces };
}