// Regenerates docs/reference/route-mapping.{json,md} from the spec artifact
// "Chatbot Backend Split" (the source of truth for the route table, §4.2–4.3).
//
// Usage: node scripts/reference/sync-route-mapping.mjs <artifact.html> <chatbot-commit>
//   <artifact.html>   the artifact page saved locally (Artifact read gives its path)
//   <chatbot-commit>  chatbot commit the artifact was last checked against (header line)
//
// Never edit the generated files by hand: change the artifact, then run this.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const [htmlPath, commit] = process.argv.slice(2);
if (!htmlPath || !commit) {
  console.error('usage: node scripts/reference/sync-route-mapping.mjs <artifact.html> <chatbot-commit>');
  process.exit(1);
}
const html = readFileSync(htmlPath, 'utf8');

function constArray(name) {
  const line = html.split('\n').find((l) => l.startsWith(`const ${name}=`));
  if (!line) throw new Error(`const ${name} not found in ${htmlPath}`);
  return JSON.parse(line.slice(`const ${name}=`.length).replace(/;\s*$/, ''));
}

const routes = constArray('ROUTES');
const newRoutes = constArray('ROUTES_NEW');
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const out = join(root, 'docs', 'reference');

writeFileSync(join(out, 'route-mapping.json'), `${JSON.stringify({ routes, newRoutes }, null, 1)}\n`);

const cell = (v) => String(v ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
// GFM: a `|` must be escaped inside a table cell even within a code span.
const code = (v) => '`' + cell(v) + '`';
const lines = [
  '# Route mapping (nguồn: tài liệu Backend Split §4.2)',
  '',
  `> Sinh từ artifact "Chatbot Backend Split" (commit chatbot ${commit}). Không sửa tay —`,
  '> nếu spec đổi, sinh lại. Cột **Đợt** khớp với các phase W1–W6 trong docs/PLAN.md.',
  '>',
  '> **Tách database (2026-11-20):** backend và Engine dùng DB riêng; cột Internal ghi sự kiện Redis Streams thay cho',
  '> E5/E8/E9 và callback B1, endpoint mới có B-API B2–B4 (Engine gọi backend). Xem [integration.md](../integration.md).',
];
const groups = [...new Set(routes.map((r) => r.group))];
for (const group of groups) {
  lines.push('', `## ${group}`, '', '| # | Đợt | Bên xử lý | Hiện tại (FastAPI) | Mới (/api/v1) | Internal | Ghi chú |', '|---|---|---|---|---|---|---|');
  for (const r of routes.filter((x) => x.group === group)) {
    lines.push(`| ${r.id} | ${r.wave} | ${r.handledBy} | ${code(r.current)} | ${code(r.new)} | ${cell(r.internal)} | ${cell(r.notes)} |`);
  }
}
lines.push('', '## Endpoint mới (§4.3)', '', '| Mới | Bên xử lý | Đợt | Ghi chú |', '|---|---|---|---|');
for (const r of newRoutes) lines.push(`| ${code(r.new)} | ${r.handledBy} | ${r.wave} | ${cell(r.notes)} |`);
writeFileSync(join(out, 'route-mapping.md'), `${lines.join('\n')}\n`);
console.log(`route-mapping: ${routes.length} routes, ${newRoutes.length} new endpoints`);
