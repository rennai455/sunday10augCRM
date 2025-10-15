import { runMigrations } from '../../db/run-migrations.js';
import { seed } from '../../db/seed.js';
import { query } from '../db/pool.js';
import config from '../../config/index.js';

async function initDatabase() {
  console.log('⏳ Preparing database...');
  try {
    console.log('→ Running migrations');
    await runMigrations();
    console.log('→ Seeding data');
    await seed();
    // Verify seeded admin exists
    try {
      const email = config.SEED_ADMIN_EMAIL;
      const check = await query('SELECT id FROM users WHERE email = $1', [email]);
      if (check.rowCount > 0) {
        console.log('✅ Admin seed confirmed for', email);
      } else {
        console.warn('⚠️ Admin seed not found for', email);
      }
    } catch {}
    console.log('✅ Database ready');
  } catch (err) {
    console.error('❌ Database initialization failed:', err);
    throw err;
  }
}

export { initDatabase };
export default { initDatabase };
