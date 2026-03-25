const fs = require("fs");
const path = require("path");
const AdmZip = require("adm-zip");
const axios = require("axios");
const FormData = require("form-data");

const { buscarEmpresaPorCnpj } = require('./empresaCache')

const STATE_FILE = path.join(__dirname, "history_state.json");

function carregarState() {
  if (!fs.existsSync(STATE_FILE)) {
    return { historyId: null, ultimaExecucao: null };
  }

  return JSON.parse(fs.readFileSync(STATE_FILE));
}

function salvarState(historyId) {
  const state = {
    historyId,
    ultimaExecucao: new Date().toISOString(),
  };

  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));

  console.log("State atualizado:", state);
}

function ehXml(nomeArquivo) {
  return nomeArquivo.toLowerCase().endsWith(".xml");
}

function limparZipMantendoSomenteXml(zipPath) {
  const zipOriginal = new AdmZip(zipPath);
  const entries = zipOriginal.getEntries();

  const zipLimpo = new AdmZip();

  let totalArquivos = 0;
  let totalXml = 0;
  let totalDescartados = 0;

  for (const entry of entries) {
    if (entry.isDirectory) continue;

    totalArquivos++;

    const nomeInterno = entry.entryName;

    if (!ehXml(nomeInterno)) {
      totalDescartados++;
      continue;
    }

    const buffer = entry.getData();

    zipLimpo.addFile(nomeInterno, buffer);
    totalXml++;
  }

  if (totalXml === 0) {
    return {
      possuiXml: false,
      totalArquivos,
      totalXml: 0,
      totalDescartados,
      zipGerado: null,
    };
  }

  const dir = path.dirname(zipPath);
  const ext = path.extname(zipPath);
  const base = path.basename(zipPath, ext);

  const novoZipPath = path.join(dir, `${base}_somente_xml.zip`);
  zipLimpo.writeZip(novoZipPath);

  return {
    possuiXml: true,
    totalArquivos,
    totalXml,
    totalDescartados,
    zipGerado: novoZipPath,
  };
}

function listarArquivosProcessaveis(dir) {
  return fs
    .readdirSync(dir)
    .filter((arquivo) => {
      const lower = arquivo.toLowerCase();
      return lower.endsWith(".xml") || lower.endsWith(".zip");
    })
    .map((arquivo) => path.join(dir, arquivo));
}

function extrairChaveDoNomeArquivo(caminhoArquivo) {
  const nomeArquivo = path.basename(caminhoArquivo);
  const match = nomeArquivo.match(/\d{44}/);
  return match ? match[0] : null;
}

function chavePareceValida(chave) {
  return /^\d{44}$/.test(chave);
}

function extrairCnpjDaChave(chave) {
  if (!chavePareceValida(chave)) {
    return null;
  }

  return chave.substring(6, 20);
}

async function identificarEmpresaDoXmlInterno(nomeXmlInterno) {
  const chave = extrairChaveDoNomeArquivo(nomeXmlInterno);

  if (!chavePareceValida(chave)) {
    return {
      status: "CHAVE_INVALIDA",
      empresa: null,
      chave: null,
      cnpj: null,
    };
  }

  const cnpj = extrairCnpjDaChave(chave);

  if (!cnpj) {
    return {
      status: "CNPJ_INVALIDO",
      empresa: null,
      chave,
      cnpj: null,
    };
  }

  const resultado = await buscarEmpresaPorCnpj(cnpj);

  if (resultado.status === "NAO_ENCONTRADA") {
    return {
      status: "NAO_ENCONTRADA",
      empresa: null,
      chave,
      cnpj,
    };
  }

  return {
    status: "OK",
    empresa: resultado.empresa,
    chave,
    cnpj,
  };
}

async function agruparXmlsDoZipPorEmpresa(caminhoZip) {
  const zip = new AdmZip(caminhoZip);
  const entries = zip.getEntries();

  const grupos = {};

  for (const entry of entries) {
    if (entry.isDirectory) continue;
    if (!entry.entryName.toLowerCase().endsWith(".xml")) continue;

    const resultado = await identificarEmpresaDoXmlInterno(entry.entryName);

    if (resultado.status !== "OK") {
      continue;
    }

    const empresa = resultado.empresa;
    const chaveGrupo = String(empresa.id_empresa);

    if (!grupos[chaveGrupo]) {
      grupos[chaveGrupo] = {
        empresa,
        xmls: [],
      };
    }

    grupos[chaveGrupo].xmls.push({
      nome: entry.entryName,
      buffer: entry.getData(),
    });
  }

  return grupos;
}

function criarZipPorEmpresa(nomeBase, empresa, xmls, pastaSaida) {
  const zip = new AdmZip();

  for (const xml of xmls) {
    zip.addFile(xml.nome, xml.buffer);
  }

  const caminhoZip = path.join(
    pastaSaida,
    `${nomeBase}_empresa_${empresa.id_empresa}.zip`,
  );

  zip.writeZip(caminhoZip);

  return caminhoZip;
}

async function enviarArquivoParaApi(caminhoXml, token) {
  const form = new FormData();
  form.append(
    "file",
    fs.createReadStream(caminhoXml),
    path.basename(caminhoXml),
  );

  const response = await axios.post("http://localhost:3000/upload", form, {
    headers: {
      ...form.getHeaders(),
      Authorization: `Bearer ${token}`,
    },
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
    timeout: 30000,
  });

  return response.data;
}

module.exports = {
  salvarState,
  carregarState,
  limparZipMantendoSomenteXml,
  listarArquivosProcessaveis,
  chavePareceValida,
  agruparXmlsDoZipPorEmpresa,
  extrairChaveDoNomeArquivo,
  extrairCnpjDaChave,
  enviarArquivoParaApi,
  criarZipPorEmpresa,
};
