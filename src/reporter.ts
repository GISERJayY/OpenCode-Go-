// 拉取所有账号用量的共享逻辑，供 CLI 和 Web 看板复用
import { fetchGoHtml } from './fetcher.js';
import { parseUsage } from './parser.js';
import type { Account, UsageReport } from './types.js';

export async function fetchReport(acc: Account): Promise<UsageReport> {
  const fetched = await fetchGoHtml(acc.cookie, acc.workspaceId);
  if (!fetched.ok) {
    return {
      ok: false,
      error: fetched.message,
      name: acc.name,
      workspaceId: acc.workspaceId,
      rolling: null,
      weekly: null,
      monthly: null,
    };
  }
  const parsed = parseUsage(fetched.html);
  return {
    ok: true,
    name: acc.name,
    email: parsed.email,
    workspaceId: acc.workspaceId,
    rolling: parsed.rolling,
    weekly: parsed.weekly,
    monthly: parsed.monthly,
  };
}

// 简易并发限流
export async function fetchAllReports(accounts: Account[], limit = 4): Promise<UsageReport[]> {
  const results: UsageReport[] = new Array(accounts.length);
  let idx = 0;
  const workers = Array.from({ length: Math.min(limit, accounts.length) }, async () => {
    while (idx < accounts.length) {
      const cur = idx++;
      results[cur] = await fetchReport(accounts[cur]);
    }
  });
  await Promise.all(workers);
  return results;
}