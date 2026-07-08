// CLI 主入口
import { loadConfig } from './config.js';
import { renderTable } from './render.js';
import { fetchAllReports } from './reporter.js';

interface Args {
  config?: string;
  json?: boolean;
  serve?: number;     // 启动本地 Web 看板的端口
}

function parseArgs(argv: string[]): Args {
  const a: Args = {};
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === '--config' || t === '-c') a.config = argv[++i];
    else if (t === '--json') a.json = true;
    else if (t === '--serve') a.serve = Number(argv[++i]) || 8080;
    else if (t === '--help' || t === '-h') {
      console.log('用法: opencodego-usage [--config accounts.yaml] [--json] [--serve 8080]');
      process.exit(0);
    }
  }
  return a;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cfg = loadConfig(args.config);

  if (args.serve) {
    const { startServer } = await import('./server.js');
    await startServer(cfg, args.serve);
    return; // 不退出
  }

  const reports = await fetchAllReports(cfg.accounts);
  if (args.json) {
    process.stdout.write(JSON.stringify(reports, null, 2) + '\n');
  } else {
    process.stdout.write(renderTable(reports, cfg.warn, cfg.alert) + '\n');
  }
}

main().catch((e: any) => {
  console.error('致命错误:', e?.message ?? e);
  process.exit(1);
});