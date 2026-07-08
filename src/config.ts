// 配置加载与校验
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse, stringify } from 'yaml';
import type { Config, Account } from './types.js';

const DEFAULT = { warn: 80, alert: 95 };

// 记住最近一次加载的配置文件路径，addAccount 据此落盘
let lastFile: string | null = null;

export function loadConfig(path?: string): Config {
  const file = resolve(path ?? 'accounts.yaml');
  lastFile = file;
  let raw: any;
  if (!existsSync(file)) {
    throw new Error(`配置文件不存在 ${file}，请先参照 accounts.example.yaml 创建`);
  }
  try {
    raw = parse(readFileSync(file, 'utf8'));
  } catch (e: any) {
    throw new Error(`读取配置失败 ${file}: ${e?.message ?? e}`);
  }
  if (!raw || typeof raw !== 'object') {
    throw new Error(`配置 ${file} 为空或格式错误`);
  }
  const accounts = raw.accounts as Account[] | undefined;
  if (!Array.isArray(accounts)) {
    raw.accounts = [];
    // 允许空配置：用户可从看板「添加账号」按钮添加第一个账号
  }
  const accList = (raw.accounts ?? []) as Account[];
  for (const a of accList) {
    if (!a.name) throw new Error('每个 account 必须有 name');
    if (!a.cookie) throw new Error(`account "${a.name}" 缺少 cookie`);
    if (!a.workspaceId || !a.workspaceId.startsWith('wrk_')) {
      throw new Error(`account "${a.name}" 的 workspaceId 必须以 wrk_ 开头`);
    }
    a.cookie = String(a.cookie).trim();
    a.workspaceId = String(a.workspaceId).trim();
  }
  return {
    accounts: accList,
    warn: Number(raw.warn ?? DEFAULT.warn),
    alert: Number(raw.alert ?? DEFAULT.alert),
  };
}

// 运行时新增账号：先加到 cfg.accounts，再落盘到 yaml 文件
// name/workspaceId/cookie 任一为空则报错；同 workspaceId 已存在则覆盖
export function addAccount(cfg: Config, acc: { name: string; cookie: string; workspaceId: string }): { added: boolean; name: string } {
  const name = acc.name?.trim();
  const cookie = acc.cookie?.trim();
  const wid = acc.workspaceId?.trim();
  if (!name) throw new Error('account 必须有 name');
  if (!cookie) throw new Error('account 必须有 cookie');
  if (!wid || !wid.startsWith('wrk_')) throw new Error('workspaceId 必须以 wrk_ 开头');

  const existing = cfg.accounts.findIndex(a => a.workspaceId === wid);
  let added: boolean;
  if (existing >= 0) {
    cfg.accounts[existing] = { name, cookie, workspaceId: wid };
    added = false;
  } else {
    cfg.accounts.push({ name, cookie, workspaceId: wid });
    added = true;
  }
  persist(cfg);
  return { added, name };
}

// 把当前 cfg 写回 yaml 文件（保留 warn/alert）
function persist(cfg: Config) {
  if (!lastFile) return;
  const out = {
    warn: cfg.warn,
    alert: cfg.alert,
    accounts: cfg.accounts.map(a => ({ name: a.name, cookie: a.cookie, workspaceId: a.workspaceId })),
  };
  writeFileSync(lastFile, stringify(out), 'utf8');
}

// 删除账号：按 workspaceId
export function removeAccount(cfg: Config, workspaceId: string): boolean {
  const i = cfg.accounts.findIndex(a => a.workspaceId === workspaceId);
  if (i < 0) return false;
  cfg.accounts.splice(i, 1);
  persist(cfg);
  return true;
}

// 改名：按 workspaceId 定位账号，改其 name 并落盘
export function renameAccount(cfg: Config, workspaceId: string, newName: string): boolean {
  const name = newName?.trim();
  if (!name) throw new Error('新名字不能为空');
  const a = cfg.accounts.find(a => a.workspaceId === workspaceId);
  if (!a) return false;
  a.name = name;
  persist(cfg);
  return true;
}