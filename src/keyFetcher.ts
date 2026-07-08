// 带 cookie 请求 keys 页 HTML，复用 fetchGoHtml 的 FetchResult 格式
import type { FetchResult } from './fetcher.js';

export async function fetchKeysHtml(
  cookie: string,
  workspaceId: string,
  signal?: AbortSignal,
): Promise<FetchResult> {
  const url = `https://opencode.ai/workspace/${workspaceId}/keys`;
  try {
    const res = await fetch(url, {
      headers: {
        cookie: `auth=${cookie}`,
        accept: 'text/html,application/xhtml+xml',
        'user-agent': 'Mozilla/5.0 (compatible; opencodego-usage/0.1)',
      },
      redirect: 'manual',
      signal,
    });
    // 3xx 跳转：多半是未登录跳 /auth/authorize
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location') || '';
      if (loc.includes('/auth/')) {
        return { ok: false, kind: 'auth', message: 'cookie 失效，请重新登录导出' };
      }
      return { ok: false, kind: 'auth', message: `意外跳转: ${loc}` };
    }
    if (res.status !== 200) {
      return { ok: false, kind: 'network', message: `HTTP ${res.status}` };
    }
    const html = await res.text();
    return { ok: true, html };
  } catch (e: any) {
    return { ok: false, kind: 'network', message: e?.message ?? String(e) };
  }
}
