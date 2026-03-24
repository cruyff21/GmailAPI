require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,

  // ajustes importantes
  max: 10, // máximo de conexões no pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});


async function query(text, params) {
  const start = Date.now();

  try {
    const res = await pool.query(text, params);

    const duration = Date.now() - start;

    console.log("📊 Query executada", {
      duration: `${duration}ms`,
      rows: res.rowCount,
    });

    return res;
  } catch (err) {
    console.error("❌ Erro na query:", err.message);
    throw err;
  }
}


async function testarConexao() {
  try {
    const res = await query("SELECT NOW()");
    console.log("✅ Conectado ao Postgres:", res.rows[0]);
  } catch (err) {
    console.error("❌ Falha na conexão:", err.message);
  }
}

//testarConexao()

module.exports = {
  query,
  pool,
  testarConexao,
};