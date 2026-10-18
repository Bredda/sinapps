import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const ADMIN_URL = process.env.E2E_ADMIN_DATABASE_URL ?? "postgres://sinapps:sinapps@localhost:5433/postgres";
export const E2E_DATABASE_URL = process.env.E2E_DATABASE_URL ?? "postgres://sinapps:sinapps@localhost:5433/sinapps_e2e";

/** A fresh database per run: dropped, recreated and migrated. Needs `pnpm infra:up`. */
export default async function globalSetup() {
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  try {
    await admin.connect();
  } catch (error) {
    throw new Error(`Cannot reach PostgreSQL at ${ADMIN_URL}: start the infra with \`pnpm infra:up\`.`, {
      cause: error,
    });
  }
  await admin.query("DROP DATABASE IF EXISTS sinapps_e2e WITH (FORCE)");
  await admin.query("CREATE DATABASE sinapps_e2e");
  await admin.end();

  const pool = new pg.Pool({ connectionString: E2E_DATABASE_URL });
  await migrate(drizzle(pool), { migrationsFolder: "../../packages/db/migrations" });
  await pool.end();
}
