// 一次性脚本：按顺序把 supabase/migrations/*.sql 应用到已连接的 Supabase 库
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const dir = join(process.cwd(), "supabase", "migrations");
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

const url = new URL(process.env.POSTGRES_URL_NON_POOLING);
url.search = ""; // 移除 sslmode 等参数，改用下方显式 ssl 配置
const client = new pg.Client({
  connectionString: url.toString(),
  ssl: { rejectUnauthorized: false },
});

await client.connect();

// 迁移记录表，支持重跑跳过
await client.query(`create table if not exists public._v0_migrations (
  name text primary key, applied_at timestamptz default now()
)`);

const { rows } = await client.query("select name from public._v0_migrations");
const done = new Set(rows.map((r) => r.name));

let ok = 0;
for (const f of files) {
  if (done.has(f)) {
    console.log(`SKIP ${f}`);
    continue;
  }
  const sql = readFileSync(join(dir, f), "utf8");
  try {
    await client.query("begin");
    await client.query(sql);
    await client.query("insert into public._v0_migrations(name) values ($1)", [f]);
    await client.query("commit");
    console.log(`OK   ${f}`);
    ok++;
  } catch (e) {
    await client.query("rollback");
    console.error(`FAIL ${f}: ${e.message}`);
    process.exitCode = 1;
    break;
  }
}

console.log(`Applied ${ok} migrations.`);
await client.end();
