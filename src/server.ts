// 本地 Web 看板：HTTP 服务 + 内嵌前端页面
import { createServer } from 'node:http';
import type { Config } from './types.js';
import { fetchAllReports } from './reporter.js';

const HTML = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>OpenCode Go 用量看板</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, 'Segoe UI', 'Microsoft YaHei', sans-serif; margin: 0; background: #0d1117; color: #c9d1d9; min-height: 100vh; }
  header { padding: 16px 24px; background: #161b22; border-bottom: 1px solid #30363d; display: flex; justify-content: space-between; align-items: center; }
  h1 { margin: 0; font-size: 18px; color: #58a6ff; }
  .meta { font-size: 12px; color: #8b949e; }
  .meta button { background: #21262d; color: #c9d1d9; border: 1px solid #30363d; padding: 4px 10px; border-radius: 6px; cursor: pointer; margin-left: 8px; }
  .meta button:hover { background: #30363d; }
  main { padding: 24px; max-width: 1200px; margin: 0 auto; }
  .account { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 16px; margin-bottom: 16px; }
  .account-head { display: flex; align-items: baseline; gap: 12px; margin-bottom: 12px; flex-wrap: wrap; }
  .account-name { font-size: 16px; font-weight: 600; color: #f0f6fc; }
  .account-email { font-size: 12px; color: #8b949e; }
  .account-error { color: #f85149; font-size: 13px; margin-top: 8px; }
  .tiers { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
  @media (max-width: 640px) { .tiers { grid-template-columns: 1fr; } }
  .tier { background: #0d1117; border: 1px solid #21262d; border-radius: 6px; padding: 12px; }
  .tier-label { font-size: 12px; color: #8b949e; margin-bottom: 4px; }
  .tier-cap { font-size: 11px; color: #6e7681; }
  .tier-main { display: flex; align-items: baseline; gap: 6px; margin: 4px 0 8px; }
  .tier-pct { font-size: 24px; font-weight: 700; }
  .tier-dollars { font-size: 12px; color: #8b949e; }
  .bar { height: 8px; background: #21262d; border-radius: 4px; overflow: hidden; margin: 6px 0; }
  .bar-fill { height: 100%; border-radius: 4px; transition: width .4s; background: #3fb950; }
  .bar-fill.warn { background: #d29922; }
  .bar-fill.alert { background: #f85149; }
  .tier-reset { font-size: 11px; color: #6e7681; margin-top: 6px; }
  .status-pill { font-size: 11px; padding: 1px 6px; border-radius: 10px; background: #1f2a1f; color: #3fb950; }
  .lifting { opacity: .5; }
  .btn { background: #21262d; color: #c9d1d9; border: 1px solid #30363d; padding: 4px 12px; border-radius: 6px; cursor: pointer; margin-left: 8px; font-size: 13px; }
  .btn:hover { background: #30363d; }
  .btn.primary { background: #1f6feb; color: #fff; border-color: #1f6feb; }
  .btn.primary:hover { background: #388bfd; }
  .btn.danger { color: #f85149; }
  .btn:disabled { opacity: .5; cursor: not-allowed; }
  .overlay { position: fixed; inset: 0; background: rgba(0,0,0,.65); display: flex; align-items: center; justify-content: center; z-index: 99; }
  .modal { background: #161b22; border: 1px solid #30363d; border-radius: 10px; padding: 24px; max-width: 460px; width: 90%; text-align: center; }
  .modal h2 { margin: 0 0 8px; color: #58a6ff; font-size: 18px; }
  .modal p { color: #8b949e; font-size: 13px; line-height: 1.6; margin: 6px 0; }
  .spinner { display: inline-block; width: 22px; height: 22px; border: 2px solid #30363d; border-top-color: #58a6ff; border-radius: 50%; animation: spin .8s linear infinite; margin: 8px 0; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .del-btn { background: transparent; color: #f85149aa; border: none; cursor: pointer; font-size: 12px; margin-top: 8px; }
  .del-btn:hover { color: #f85149; }
  .ren-btn { background: transparent; color: #58a6ffaa; border: none; cursor: pointer; font-size: 12px; margin-top: 8px; margin-right: 10px; }
  .ren-btn:hover { color: #58a6ff; }
  .acc-actions { margin-left: auto; }
</style></head>
<body>
<header>
  <h1>OpenCode Go 用量看板</h1>
  <div class="meta">
    <span id="ts">—</span>
    <button id="refresh" class="btn">刷新</button>
    <button id="addAccount" class="btn primary">+ 添加账号</button>
  </div>
</header>
<main id="root"><p>加载中…</p></main>
<script>
  const LIMITS = { rolling: 12, weekly: 30, monthly: 60 };
  const TIER_META = {
    rolling: { label: '5 小时滚动', cap: 12 },
    weekly:  { label: '每周', cap: 30 },
    monthly: { label: '每月', cap: 60 },
  };
  let cfg = { warn: 80, alert: 95 };

  function fmtCountdown(sec) {
    if (sec < 0 || !isFinite(sec)) return '--';
    const s = Math.floor(sec), d = Math.floor(s/86400), h = Math.floor((s%86400)/3600), m = Math.floor((s%3600)/60);
    if (d > 0) return d + 'd ' + h + 'h';
    if (h > 0) return h + 'h ' + m + 'm';
    return m + 'm';
  }
  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  function renderTier(key, t) {
    if (!t) return '<div class="tier"><div class="tier-label">'+TIER_META[key].label+'</div><div class="tier-main">—</div></div>';
    const p = t.usagePercent;
    const usd = (p / 100 * TIER_META[key].cap).toFixed(2);
    const cls = p >= cfg.alert ? 'alert' : p >= cfg.warn ? 'warn' : '';
    return '<div class="tier">'
      + '<div class="tier-label">'+TIER_META[key].label+' <span class="tier-cap">上限 $'+TIER_META[key].cap+'</span></div>'
      + '<div class="tier-main"><span class="tier-pct" style="color:'+(cls==='alert'?'#f85149':cls==='warn'?'#d29922':'#3fb950')+'">'+p+'%</span>'
      + '<span class="tier-dollars">$'+usd+' / $'+TIER_META[key].cap+'</span></div>'
      + '<div class="bar"><div class="bar-fill '+cls+'" style="width:'+Math.min(100,p)+'%"></div></div>'
      + '<div class="tier-reset">重置于 '+fmtCountdown(t.resetInSec)+'</div>'
      + '<span class="status-pill">status='+escapeHtml(t.status)+'</span>'
      + '</div>';
  }
  function render(reports) {
    const root = document.getElementById('root');
    if (!reports.length) { root.innerHTML = '<p>没有账号，点右上角「+ 添加账号」开始</p>'; return; }
    root.innerHTML = reports.map(r => {
      const actions = '<span class="acc-actions">'
        + '<button class="ren-btn" data-ren="'+escapeHtml(r.workspaceId)+'" data-name="'+escapeHtml(r.name)+'">改名</button>'
        + '<button class="del-btn" data-del="'+escapeHtml(r.workspaceId)+'">删除</button>'
        + '</span>';
      if (!r.ok) {
        return '<div class="account"><div class="account-head"><span class="account-name">'+escapeHtml(r.name)+'</span>'
          + actions + '</div>'
          + '<div class="account-error">'+escapeHtml(r.error || '未知错误')+'</div></div>';
      }
      return '<div class="account">'
        + '<div class="account-head"><span class="account-name">'+escapeHtml(r.name)+'</span>'
        + '<span class="account-email">'+escapeHtml(r.email||'-')+'</span>'
        + '<span class="tier-cap">'+escapeHtml(r.workspaceId)+'</span>'
        + actions + '</div>'
        + '<div class="tiers">'
        + renderTier('rolling', r.rolling)
        + renderTier('weekly', r.weekly)
        + renderTier('monthly', r.monthly)
        + '</div></div>';
    }).join('');
    // 绑定删除
    root.querySelectorAll('[data-del]').forEach(b => {
      b.addEventListener('click', async () => {
        if (!confirm('删除该账号？也会从 accounts.yaml 中移除。')) return;
        const wid = b.getAttribute('data-del');
        await fetch('/api/account/delete', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({ workspaceId: wid }) });
        refresh();
      });
    });
    // 绑定改名
    root.querySelectorAll('[data-ren]').forEach(b => {
      b.addEventListener('click', async () => {
        const wid = b.getAttribute('data-ren');
        const old = b.getAttribute('data-name') || '';
        const name = prompt('给账号起个名字：', old);
        if (name == null || !name.trim()) return;
        const res = await fetch('/api/account/rename', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({ workspaceId: wid, name }) });
        const data = await res.json();
        if (!data.ok) alert('改名失败: ' + (data.error || '未知错误'));
        refresh();
      });
    });
  }

  function showModal(html) {
    let el = document.getElementById('modal');
    if (el) el.remove();
    el = document.createElement('div');
    el.id = 'modal';
    el.className = 'overlay';
    el.innerHTML = '<div class="modal">' + html + '</div>';
    document.body.appendChild(el);
  }
  function closeModal() { document.getElementById('modal')?.remove(); }

  async function startAddAccount() {
    const btn = document.getElementById('addAccount');
    btn.disabled = true;
    showModal('<h2>添加账号</h2><p>已为你打开独立浏览器登录 opencode。</p><p>请在弹出的窗口里完成 GitHub 或 Google 登录，登录完成后会自动关闭并添加到此看板。</p><div class="spinner"></div><p style="color:#6e7681">可在 accounts.yaml 找到持久化凭证</p>');
    try {
      const res = await fetch('/api/account/add', { method: 'POST' });
      const data = await res.json();
      closeModal();
      if (data.ok) {
        // 让用户立刻给新账号起个好认的名字
        const suggest = data.email ? data.email.split('@')[0] : data.name;
        const name = prompt('账号已添加！给它起个名字：', suggest);
        if (name && name.trim() && name !== data.name) {
          await fetch('/api/account/rename', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({ workspaceId: data.workspaceId, name }) });
        }
        refresh();
      } else {
        alert('添加失败: ' + (data.error || '未知错误'));
      }
    } catch (e) {
      closeModal();
      alert('添加失败: ' + e);
    } finally {
      btn.disabled = false;
    }
  }
  document.getElementById('addAccount').addEventListener('click', startAddAccount);

  async function refresh() {
    const ts = document.getElementById('ts');
    const root = document.getElementById('root');
    root.classList.add('lifting');
    try {
      const res = await fetch('/api/usage');
      const data = await res.json();
      cfg = { warn: data.warn ?? 80, alert: data.alert ?? 95 };
      render(data.reports);
      ts.textContent = '更新于 ' + data.time;
    } catch (e) {
      ts.textContent = '加载失败: ' + e;
    } finally {
      root.classList.remove('lifting');
    }
  }
  document.getElementById('refresh').addEventListener('click', refresh);
  refresh();
  setInterval(refresh, 60000);
</script>
</body></html>`;

// 启动 HTTP 服务
import { addAccount, removeAccount, renameAccount } from './config.js';
import { loginAndGrabCookie } from './login.js';

// 防止并发登录：同时只能有一个登录浏览器
let loginBusy = false;

export async function startServer(cfg: Config, port: number) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://localhost:${port}`);
    if (url.pathname === '/' || url.pathname === '/index.html') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(HTML);
      return;
    }
    if (url.pathname === '/api/usage') {
      try {
        const reports = await fetchAllReports(cfg.accounts);
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
          time: new Date().toISOString(),
          warn: cfg.warn,
          alert: cfg.alert,
          reports,
        }));
      } catch (e: any) {
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: e?.message ?? String(e) }));
      }
      return;
    }
    if (url.pathname === '/api/account/add' && req.method === 'POST') {
      if (loginBusy) {
        res.writeHead(409, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: '已有登录进行中，请稍后再试' }));
        return;
      }
      loginBusy = true;
      try {
        const r = await loginAndGrabCookie();
        if (!r.ok || !r.authCookie || !r.workspaceId) {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: r.error ?? '登录失败' }));
          return;
        }
        // 默认名：邮箱前缀 或 workspaceId 末 8 位
        const name = (r.email ? r.email.split('@')[0] : r.workspaceId.slice(-8)) + '';
        const result = addAccount(cfg, { name, cookie: r.authCookie, workspaceId: r.workspaceId });
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
          ok: true,
          added: result.added,
          name: result.name,
          workspaceId: r.workspaceId,
          email: r.email,
        }));
      } catch (e: any) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: e?.message ?? String(e) }));
      } finally {
        loginBusy = false;
      }
      return;
    }
    if (url.pathname === '/api/account/delete' && req.method === 'POST') {
      try {
        const body = await readBody(req);
        const { workspaceId } = JSON.parse(body || '{}');
        const removed = removeAccount(cfg, String(workspaceId ?? ''));
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: removed }));
      } catch (e: any) {
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: e?.message ?? String(e) }));
      }
      return;
    }
    if (url.pathname === '/api/account/rename' && req.method === 'POST') {
      try {
        const body = await readBody(req);
        const { workspaceId, name } = JSON.parse(body || '{}');
        const ok = renameAccount(cfg, String(workspaceId ?? ''), String(name ?? ''));
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok }));
      } catch (e: any) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: e?.message ?? String(e) }));
      }
      return;
    }
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('Not Found');
  });
  server.listen(port, () => {
    console.log(`OpenCode Go 用量看板已启动: http://localhost:${port}`);
    console.log('按 Ctrl+C 停止');
  });
}

// 读 POST body
function readBody(req: any): Promise<string> {
  return new Promise((resolve, reject) => {
    let buf = '';
    req.on('data', (c: Buffer) => { buf += c.toString(); });
    req.on('end', () => resolve(buf));
    req.on('error', reject);
  });
}