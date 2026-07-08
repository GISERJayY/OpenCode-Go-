// 最小可行性验证：能否用 puppeteer-core + bun 驱动系统 Chrome，
// 并从登录态页面用 CDP 拿到 HttpOnly 的 auth cookie。
import { launch } from 'puppeteer-core';

// 探测系统 Chrome 路径
const CHROME_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];
const fs = await import('node:fs');
const chromePath = CHROME_PATHS.find(p => fs.existsSync(p));
console.log('chrome path:', chromePath);

const browser = await launch({
  executablePath: chromePath,
  headless: false,
  userDataDir: '',  // 替换为你想持久化的 Chrome profile 目录路径
  args: ['--no-first-run', '--no-default-browser-check'],
});
const page = await browser.newPage();
await page.goto('https://opencode.ai/auth/authorize');

// 等用户手动登录完成（页面跳到 /workspace/.../go）
console.log('请在新打开的浏览器里登录 opencode……等待跳到 workspace 页');
const deadline = Date.now() + 90 * 1000;
let landed: string | null = null;
while (Date.now() < deadline) {
  try {
    const u = page.url();
    if (/\/workspace\/wrk_/.test(u)) { landed = u; break; }
  } catch {}
  await new Promise(r => setTimeout(r, 1000));
}
if (!landed) {
  console.log('等待超时，当前 URL:', page.url());
  await browser.close();
  process.exit(1);
}
console.log('检测到已跳到 workspace 页:', landed);

// 用 CDP 拿所有 cookie（含 HttpOnly）
const client = await page.target().createCDPSession();
const { cookies } = await client.send('Network.getAllCookies') as any;
const auth = cookies.find((c: any) => c.name === 'auth' && c.domain === 'opencode.ai');
console.log('auth cookie:', auth ? '找到, 长 ' + auth.value.length + ' 字符' : '未找到');
const url = page.url();
const wid = url.match(/wrk_[A-Za-z0-9]+/)?.[0];
console.log('workspaceId:', wid);
await browser.close();