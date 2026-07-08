// 从 keys 页 HTML 中提取 API 密钥列表
// 真实 SSR 注入格式 (已验证):
//   _$HY.r["key.list[\"wrk_xxx\"]"] = $R[N] = ...
//   $R[X]($R[Y], $R[Z]=[$R[W]={id:"key_xxx",name:"...",key:"sk-...",keyDisplay:"sk-...",timeUsed:null|Date,userID:"...",email:"..."}])
import type { ApiKey } from './types.js';

// ULID Crockford base32 字符集
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

// 从 ULID 字符串解码时间戳（前10位是 Timestamp，Crockford base32 编码）
function decodeULIDTime(ulid: string): string {
  // 移除前缀（如 "key_" 或 "usr_"）
  const clean = ulid.replace(/^[a-z]+_/, '');
  if (clean.length < 10) return '';
  const tsPart = clean.slice(0, 10);
  let ts = 0;
  for (let i = 0; i < tsPart.length; i++) {
    const v = CROCKFORD.indexOf(tsPart[i].toUpperCase());
    if (v < 0) return '';
    ts = ts * 32 + v;
  }
  // ULID 时间戳是 UNIX 毫秒
  return new Date(ts).toISOString().replace('T', ' ').slice(0, 19);
}

// 从 html 中 pos 位置向前找最近的 {，然后平衡括号提取完整对象
function extractBalanced(html: string, pos: number): string | null {
  let start = pos;
  while (start > 0 && html[start] !== '{') start--;
  if (html[start] !== '{') return null;
  let depth = 0;
  for (let i = start; i < html.length; i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}') {
      depth--;
      if (depth === 0) return html.slice(start, i + 1);
    }
  }
  return null;
}

// 从 SSR 对象字符串中提取字段
function getStr(obj: string, key: string): string | undefined {
  const m = obj.match(new RegExp(key + ':"([^"]*)"'));
  return m?.[1];
}

function getDate(obj: string, key: string): string | undefined {
  // timeUsed:null → undefined
  if (new RegExp(key + ':null').test(obj)) return undefined;
  // timeUsed:$R[N]=new Date("...")
  let m = obj.match(new RegExp(key + ':\\$R\\[\\d+\\]=new Date\\("([^"]*)"\\)'));
  if (m) return m[1].replace('T', ' ').slice(0, 19);
  // timeUsed:new Date("...")
  m = obj.match(new RegExp(key + ':new Date\\("([^"]*)"\\)'));
  if (m) return m[1].replace('T', ' ').slice(0, 19);
  return undefined;
}

export interface ParseKeysResult {
  keys: ApiKey[];
  debug: string;
}

function parseOneKey(obj: string): ApiKey | null {
  const id = getStr(obj, 'id');
  if (!id) return null;
  const name = getStr(obj, 'name') ?? '';
  const keyDisplay = getStr(obj, 'keyDisplay') ?? '';
  const keyFull = getStr(obj, 'key');
  const lastUsed = getDate(obj, 'timeUsed');
  const createdBy = getStr(obj, 'email');
  const created = decodeULIDTime(id);
  return { id, name, keyDisplay, keyFull, created, lastUsed, createdBy };
}

export function parseKeys(html: string): ParseKeysResult {
  const debug: string[] = [];
  const seen = new Set<string>();
  const keys: ApiKey[] = [];

  // 策略1：在 SSR <script> 中找 id:"key_xxx" 对象（最精准）
  const keyIdRe = /id:"(key_[A-Za-z0-9_]+)"/g;
  let m;
  while ((m = keyIdRe.exec(html)) !== null) {
    const id = m[1];
    if (seen.has(id)) continue;
    seen.add(id);
    const obj = extractBalanced(html, m.index);
    if (!obj) continue;
    const key = parseOneKey(obj);
    if (key) keys.push(key);
  }
  debug.push(`key_id匹配:${keys.length}`);

  // 策略2：如果策略1没找到，尝试在 SSR 数组中搜索
  if (keys.length === 0) {
    const arrayRe = /\$R\[\d+\]=\[\$R\[\d+\]=\{/g;
    while ((m = arrayRe.exec(html)) !== null) {
      const bracketStart = html.indexOf('[', m.index);
      if (bracketStart < 0) continue;
      let depth = 0;
      for (let i = bracketStart; i < html.length; i++) {
        if (html[i] === '[') depth++;
        else if (html[i] === ']') {
          depth--;
          if (depth === 0) {
            const arrStr = html.slice(bracketStart, i + 1);
            const objRe = /\$R\[\d+\]=\{/g;
            let om;
            while ((om = objRe.exec(arrStr)) !== null) {
              const obj = extractBalanced(arrStr, om.index + om[0].length - 1);
              if (!obj) continue;
              const key = parseOneKey(obj);
              if (key && !seen.has(key.id)) {
                seen.add(key.id);
                keys.push(key);
              }
            }
            break;
          }
        }
      }
    }
    debug.push(`SSR数组:${keys.length}`);
  }

  // 策略3：HTML body 中 data-slot 属性提取（回退）
  if (keys.length === 0) {
    const rowRe = /<tr[^>]*data-hk[^>]*>/g;
    let trCount = 0;
    while ((m = rowRe.exec(html)) !== null) {
      const endIdx = html.indexOf('</tr>', m.index);
      if (endIdx < 0) continue;
      const row = html.slice(m.index, endIdx);
      const name = row.match(/data-slot="key-name"[^>]*>([^<]*)</)?.[1]?.trim();
      const keyDisplay = row.match(/data-slot="key-value"[^>]*>.*?<span>([^<]*)</)?.[1]?.trim();
      const email = row.match(/data-slot="key-user-email"[^>]*>([^<]*)</)?.[1]?.trim();
      if (name || keyDisplay) {
        trCount++;
        keys.push({
          id: `key_row_${trCount}`,
          name: name ?? '',
          keyDisplay: keyDisplay ?? '',
          created: '',
          createdBy: email,
        });
      }
    }
    debug.push(`body_table:${keys.length}`);
  }

  if (keys.length === 0) {
    debug.push(`len:${html.length}`);
    const hyKey = html.match(/_ \$HY\.r\["([^"]*key[^"]*)"\]/gi);
    if (hyKey) debug.push(`HY_key:${hyKey.join('|')}`);
    const keyMentions = (html.match(/key/g) || []).length;
    debug.push(`key词:${keyMentions}`);
  }

  return { keys, debug: debug.join('; ') };
}
