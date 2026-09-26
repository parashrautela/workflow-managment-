import { readFile, writeFile } from 'node:fs/promises';
import { Pool } from 'pg';

const emptyState = () => ({
  projects: [],
  founderSessions: [],
  invites: [],
  clientSessions: [],
  conversations: [],
  projectUpdates: [],
  activity: [],
});

function normalizeState(value = {}) {
  const state = { ...emptyState(), ...value };
  for (const key of Object.keys(emptyState())) {
    if (!Array.isArray(state[key])) state[key] = [];
  }
  return state;
}

async function readLegacyState(dataFile) {
  try {
    return normalizeState(JSON.parse(await readFile(dataFile, 'utf8')));
  } catch (error) {
    if (error.code === 'ENOENT') return emptyState();
    throw error;
  }
}

export async function createStateStore({ dataFile, production }) {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    if (production) throw new Error('Set DATABASE_URL to a Railway PostgreSQL connection before production startup.');
    const state = await readLegacyState(dataFile);
    return {
      state,
      async save(nextState) {
        await writeFile(dataFile, JSON.stringify(nextState, null, 2), { mode: 0o600 });
      },
      async close() {},
      kind: 'local JSON file',
    };
  }

  const pool = new Pool({ connectionString, max: 3, connectionTimeoutMillis: 10_000 });
  pool.on('error', (error) => console.error('PostgreSQL pool error:', error.message));
  await pool.query(`
    CREATE TABLE IF NOT EXISTS studio_iksha_app_state (
      state_key text PRIMARY KEY,
      payload jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  let result = await pool.query('SELECT payload FROM studio_iksha_app_state WHERE state_key = $1', ['main']);
  if (result.rowCount === 0) {
    const initialState = await readLegacyState(dataFile);
    await pool.query(
      'INSERT INTO studio_iksha_app_state (state_key, payload) VALUES ($1, $2::jsonb) ON CONFLICT (state_key) DO NOTHING',
      ['main', JSON.stringify(initialState)],
    );
    result = await pool.query('SELECT payload FROM studio_iksha_app_state WHERE state_key = $1', ['main']);
  }

  return {
    state: normalizeState(result.rows[0].payload),
    async save(nextState) {
      await pool.query(
        'UPDATE studio_iksha_app_state SET payload = $1::jsonb, updated_at = now() WHERE state_key = $2',
        [JSON.stringify(nextState), 'main'],
      );
    },
    async close() {
      await pool.end();
    },
    kind: 'PostgreSQL',
  };
}
