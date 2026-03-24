const fs = require("fs");
const path = require("path");
const { query } = require("./db");

const CACHE_FILE = path.join(__dirname, "empresas_cache.json");
const CACHE_TTL_MS = 20 * 1000; // 10 min

let cacheMemoria = null;

function normalizarCnpj(valor) {
  return String(valor || "").replace(/\D/g, "");
}

function cacheExisteEmDisco() {
  return fs.existsSync(CACHE_FILE);
}

function lerCacheDoDisco() {
  if (!cacheExisteEmDisco()) return null;

  const raw = fs.readFileSync(CACHE_FILE, "utf-8");
  return JSON.parse(raw);
}

function salvarCacheNoDisco(cache) {
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), "utf-8");
}

function cacheExpirado(cache) {
  if (!cache?.updatedAt) return true;

  const updatedAt = new Date(cache.updatedAt).getTime();
  return Date.now() - updatedAt > CACHE_TTL_MS;
}

function mapearEmpresa(row) {
  return {
    id_empresa: row.id_empresa,
    cnpj: normalizarCnpj(row.cnpj),
    situacao_sist_novo: row.situacao_sist_novo,
    integration_api_token: row.integration_api_token,
  };
}

function adicionarEmpresaAoCache(cache, empresa) {
  if (!cache || !empresa?.cnpj) return;

  if (!cache.porCnpj) {
    cache.porCnpj = {};
  }

  const jaExistia = Boolean(cache.porCnpj[empresa.cnpj]);

  cache.porCnpj[empresa.cnpj] = empresa;

  if (!jaExistia) {
    cache.totalEmpresas = Object.keys(cache.porCnpj).length;
  }

  cache.updatedAt = new Date().toISOString();
  cacheMemoria = cache;
  salvarCacheNoDisco(cache);
}

async function carregarEmpresasDoBanco() {
  const sql = `
    SELECT id_empresa, cnpj, situacao_sist_novo, integration_api_token
    FROM dbo.empresas_tbl
    WHERE situacao_sist_novo = 'Ativa'
  `;

  const res = await query(sql);

  const porCnpj = {};
  let totalValidas = 0;
  let totalDescartadas = 0;
  let totalDuplicadas = 0;

  for (const row of res.rows) {
    const empresa = mapearEmpresa(row);

    if (!empresa.cnpj) {
      totalDescartadas++;
      continue;
    }

    if (porCnpj[empresa.cnpj]) {
      totalDuplicadas++;
      console.log(`⚠️ CNPJ duplicado no cache: ${empresa.cnpj}`);
    }

    porCnpj[empresa.cnpj] = empresa;
    totalValidas++;
  }

  const cache = {
    updatedAt: new Date().toISOString(),
    totalEmpresas: totalValidas,
    totalDescartadas,
    totalDuplicadas,
    porCnpj,
  };

  cacheMemoria = cache;
  salvarCacheNoDisco(cache);

  console.log("✅ Cache de empresas atualizado", {
    totalEmpresas: totalValidas,
    totalDescartadas,
    totalDuplicadas,
    updatedAt: cache.updatedAt,
  });

  return cache;
}

async function garantirCacheValido() {
  if (cacheMemoria && !cacheExpirado(cacheMemoria)) {
    return cacheMemoria;
  }

  const cacheDisco = lerCacheDoDisco();

  if (cacheDisco && !cacheExpirado(cacheDisco)) {
    cacheMemoria = cacheDisco;
    console.log("📦 Cache carregado do JSON");
    return cacheMemoria;
  }

  console.log("🔄 Cache ausente ou expirado. Recarregando do banco...");
  return await carregarEmpresasDoBanco();
}

async function buscarEmpresaPorCnpj(cnpj) {
  const cnpjNormalizado = normalizarCnpj(cnpj);
  const cache = await garantirCacheValido();

  const empresaNoCache = cache.porCnpj[cnpjNormalizado];
  if (empresaNoCache) {
    return {
      status: "ATIVA",
      empresa: empresaNoCache,
    };
  }

  console.log(
    `🔍 CNPJ ${cnpjNormalizado} não encontrado no cache. Consultando banco...`,
  );

  const sql = `
    SELECT id_empresa, cnpj, situacao_sist_novo, integration_api_token
    FROM dbo.empresas_tbl
    WHERE cnpj = $1
    LIMIT 1
  `;

  const res = await query(sql, [cnpjNormalizado]);

  if (!res.rows.length) {
    return {
      status: "NAO_ENCONTRADA",
      empresa: null,
    };
  }

  const empresa = mapearEmpresa(res.rows[0]);

  if (empresa.situacao_sist_novo !== "Ativa") {
    return {
      status: "INATIVA",
      empresa,
    };
  }

  adicionarEmpresaAoCache(cache, empresa);

  console.log(
    `✅ CNPJ ${cnpjNormalizado} encontrado no banco e adicionado ao cache.`,
  );

  return {
    status: "ATIVA",
    empresa,
  };
}

async function forcarAtualizacaoCache() {
  return await carregarEmpresasDoBanco();
}

module.exports = {
  buscarEmpresaPorCnpj,
  forcarAtualizacaoCache,
  garantirCacheValido,
  normalizarCnpj,
};

// async function main() {
//   const resultado = await buscarEmpresaPorCnpj("40275211000151");

//   if (resultado.status === "NAO_ENCONTRADA") {
//     console.log("Empresa não existe");
//   }

//   if (resultado.status === "INATIVA") {
//     console.log("Empresa encontrada, mas está inativa");
//   }

//   if (resultado.status === "ATIVA") {
//     console.log("Empresa ativa:", resultado.empresa);
//   }
//   console.log("Empresa encontrada:", resultado);
// }
// main();
