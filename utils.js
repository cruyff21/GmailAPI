const fs = require("fs");
const path = require("path");
const AdmZip = require("adm-zip");

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

module.exports = { salvarState, carregarState, limparZipMantendoSomenteXml };