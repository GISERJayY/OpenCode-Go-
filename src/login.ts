// 用 puppeteer-core 启动独立 Chrome 让用户登录 opencode，抓取 auth cookie + workspaceId
import { launch } from 'puppeteer-core';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
];

// 找系统 Chrome / Edge
export function findChromePath(): string | null {
  return CHROME_PATHS.find(p => existsSync(p)) ?? null;
}

// 每次「+ 添加账号」用一个全新临时 profile（干净 session），
// 避免复用前一个账号的 GitHub/Google 登录态导致永远只能登成第一个账号。
// 登录完成后该目录会被删除。
function makeTempProfile(): string {
  return mkdtempSync(join(tmpdir(), 'opencodego-login-'));
}

export interface LoginResult {
  ok: boolean;
  authCookie?: string;
  workspaceId?: string;
  email?: string;
  error?: string;
}

// 启动浏览器让用户登录，返回 auth cookie + workspaceId
export async function loginAndGrabCookie(opts: { timeoutMs?: number } = {}): Promise<LoginResult> {
  const chromePath = findChromePath();
  if (!chromePath) {
    return { ok: false, error: '未找到系统 Chrome 或 Edge，请先安装' };
  }
  const timeoutMs = opts.timeoutMs ?? 3 * 60 * 1000;
  const profile = makeTempProfile();   // 全新临时 profile，干净 session

  let browser;
  try {
    browser = await launch({
      executablePath: chromePath,
      headless: false,
      userDataDir: profile,
      args: ['--no-first-run', '--no-default-browser-check', '--disable-extensions'],
    });
  } catch (e: any) {
    try { rmSync(profile, { recursive: true, force: true }); } catch {}
    return { ok: false, error: '启动浏览器失败: ' + (e?.message ?? e) };
  }

  try {
    const page = await browser.newPage();
    await page.goto('https://opencode.ai/auth/authorize');

    // 监听浏览器/页面被关：用户手动关闭窗口后立刻退出，避免干等超时
    let cancelled = false;
    browser.on('disconnected', () => { cancelled = true; });
    page.on('close', () => { cancelled = true; });

    // 轮询等待跳到 workspace 页
    const deadline = Date.now() + timeoutMs;
    let landed: string | null = null;
    let lastErr: string | undefined;
    while (Date.now() < deadline) {
      if (cancelled) break;
      try {
        const u = page.url();
        if (/\/workspace\/wrk_/.test(u)) { landed = u; break; }
      } catch (e: any) {
        // page 已不可用，多半是用户关了窗
        lastErr = e?.message ?? String(e);
        cancelled = true;
        break;
      }
      await new Promise(r => setTimeout(r, 1000));
    }
    if (cancelled && !landed) {
      return { ok: false, error: '用户取消了登录（浏览器被关闭）' + (lastErr ? '：' + lastErr : '') };
    }
    if (!landed) {
      return { ok: false, error: '登录超时，未跳转到 workspace 页' };
    }

    // 用 CDP 拿所有 cookie（含 HttpOnly）
    const client = await page.target().createCDPSession();
    const { cookies } = (await client.send('Network.getAllCookies')) as any;
    const auth = cookies.find((c: any) => c.name === 'auth' && c.domain === 'opencode.ai');
    if (!auth) {
      return { ok: false, error: '登录后未找到 auth cookie' };
    }
    const workspaceId = landed.match(/wrk_[A-Za-z0-9]+/)?.[0] ?? '';

    // 顺带试拿邮箱：从 user-menu 区找形如 xxx@xxx 的文本
    let email: string | undefined;
    try {
      email = await page.evaluate(() => {
        const root = document.querySelector('[data-component="user-menu"]') || document;
        const txt = root.textContent || '';
        const m = txt.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
        return m ? m[0] : undefined;
      });
    } catch {}

    return { ok: true, authCookie: auth.value, workspaceId, email };
  } catch (e: any) {
    return { ok: false, error: '登录过程出错: ' + (e?.message ?? e) };
  } finally {
    try { await browser.close(); } catch {}
    try { rmSync(profile, { recursive: true, force: true }); } catch {}
  }
}