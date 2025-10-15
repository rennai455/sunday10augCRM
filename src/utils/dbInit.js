import { runMigrations } from '../../db/run-migrations.js';
import { seed } from '../../db/seed.js';

async function initDatabase() {
  console.log('⏳ Preparing database...');
  try {
    console.log('→ Running migrations');
    await runMigrations();
    console.log('→ Seeding data');
    await seed();
    console.log('✅ Database ready');
  } catch (err) {
    console.error('❌ Database initialization failed:', err);
    throw err;
  }
}

export { initDatabase };
export default { initDatabase };

