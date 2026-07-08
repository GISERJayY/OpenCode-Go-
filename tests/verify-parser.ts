import { readFileSync } from 'node:fs';
import { parseUsage } from '../src/parser.ts';
import { renderTable } from '../src/render.ts';

const html = readFileSync(new URL('./fixtures/go-sample.html', import.meta.url), 'utf8');
const r = parseUsage(html);
console.log(JSON.stringify(r, null, 2));

const report = {
  ok: true,
  name: '主号',
  email: r.email,
  workspaceId: 'wrk_01EXAMPLE00000000000000000',
  rolling: r.rolling,
  weekly: r.weekly,
  monthly: r.monthly,
};
console.log('\n--- 表格预览 ---');
console.log(renderTable([report as any], 80, 95));
