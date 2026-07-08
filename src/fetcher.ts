// 带 cookie 请求 go 页 HTML，识别 302→登录页 视为 cookie 失效
export type FetchResult =
  | { ok: true; html: string }
  | { ok: false; kind: 'auth' | 'network'; message: string };

export async function fetchGoHtml(
  cookie: string,
  workspaceId: string,
  signal?: AbortSignal,
): Promise<FetchResult> {
  const url = `https://opencode.ai/workspace/${workspaceId}/go`;
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
    // HTML 里没有 rollingUsage，多半是返回了登录页/错误页
    if (!html.includes('rollingUsage')) {
      return { ok: false, kind: 'auth', message: '页面未含用量数据，疑似 cookie 失效' };
    }
    return { ok: true, html };
  } catch (e: any) {
    return { ok: false, kind: 'network', message: e?.message ?? String(e) };
  }
}