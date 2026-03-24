require("dotenv").config();

const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");
const {
  salvarState,
  carregarState,
  limparZipMantendoSomenteXml,
  listarXmlsDaPasta,
  chavePareceValida,
  extrairChaveDoNomeArquivo,
  extrairCnpjDaChave,
} = require("./utils");
const { buscarEmpresaPorCnpj } = require("./empresaCache");

const DOWNLOAD_DIR = path.join(__dirname, "downloads");

if (!fs.existsSync(DOWNLOAD_DIR)) {
  fs.mkdirSync(DOWNLOAD_DIR);
}

const oauth2Client = new google.auth.OAuth2(
  process.env.CLIENT_ID,
  process.env.CLIENT_SECRET,
);

oauth2Client.setCredentials({
  refresh_token: process.env.REFRESH_TOKEN,
});

const gmail = google.gmail({
  version: "v1",
  auth: oauth2Client,
});

function encontrarAnexos(parts, anexos = []) {
  for (const part of parts || []) {
    if (part.filename) {
      anexos.push(part);
    }

    if (part.parts) {
      encontrarAnexos(part.parts, anexos);
    }
  }

  return anexos;
}

async function baixarAnexo(messageId, part) {
  const attachment = await gmail.users.messages.attachments.get({
    userId: "me",
    messageId,
    id: part.body.attachmentId,
  });

  const buffer = Buffer.from(attachment.data.data, "base64");

  const filePath = path.join(DOWNLOAD_DIR, part.filename);

  fs.writeFileSync(filePath, buffer);
  console.log("Arquivo salvo:", filePath);

  if (filePath.toLowerCase().endsWith(".zip")) {
    const resultado = limparZipMantendoSomenteXml(filePath);

    console.log(`
  📦 Analisando ZIP: ${filePath}
      Total de arquivos: ${resultado.totalArquivos}
      XML encontrados: ${resultado.totalXml}
      Descartados: ${resultado.totalDescartados}
    `);

    if (!resultado.possuiXml) {
      console.log("Zip descartado (sem XML)");
      fs.unlinkSync(filePath);
    } else {
      console.log("Zip limpo criado");

      // substitui original
      fs.unlinkSync(filePath);
      fs.renameSync(resultado.zipGerado, filePath);

      console.log("Zip substituído pelo limpo");
    }
  }
}

async function verificarAnexos(messageId) {
  const email = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
  });

  const headers = email.data.payload.headers;

  const subject =
    headers.find((h) => h.name === "Subject")?.value || "Sem assunto";

  const from = headers.find((h) => h.name === "From")?.value || "Desconhecido";

  console.log("\nEmail encontrado:");
  console.log({
    id: messageId,
    from,
    subject,
  });

  const anexos = encontrarAnexos(email.data.payload.parts);

  if (!anexos.length) {
    console.log("Nenhum anexo encontrado");
    return;
  }

  for (const part of anexos) {
    const filename = part.filename.toLowerCase();

    if (filename.endsWith(".xml") || filename.endsWith(".zip")) {
      await baixarAnexo(messageId, part);
    }
  }
}

async function buscarHistorico(historyId) {
  const res = await gmail.users.history.list({
    userId: "me",
    startHistoryId: historyId,
  });

  const history = res.data.history || [];

  for (const evento of history) {
    if (!evento.messagesAdded) continue;

    for (const item of evento.messagesAdded) {
      const messageId = item.message.id;

      console.log("\nNovo email detectado:", messageId);

      await verificarAnexos(messageId);
    }
  }

  const novoHistoryId = res.data.historyId;

  salvarState(novoHistoryId);
}

async function processarXml(caminhoXml) {
  try {
    const chave = extrairChaveDoNomeArquivo(caminhoXml);

    if (!chavePareceValida(chave)) {
      console.log(
        `⚠️ Nome do arquivo não parece ser uma chave válida: ${path.basename(caminhoXml)}`,
      );
      return;
    }

    const cnpj = extrairCnpjDaChave(chave);

    if (!cnpj) {
      console.log(`⚠️ Não foi possível extrair o CNPJ da chave: ${chave}`);
      return;
    }

    const resultado = await buscarEmpresaPorCnpj(cnpj);

    if (resultado.status === "NAO_ENCONTRADA") {
      console.log(
        `❌ Empresa não encontrada | CNPJ: ${cnpj} | Chave: ${chave}`,
      );
      return;
    }

    if (resultado.status === "INATIVA") {
      console.log(`⏸️ Empresa inativa | CNPJ: ${cnpj} | Chave: ${chave}`);
      return;
    }

    console.log(
      `✅ Empresa ativa encontrada | CNPJ: ${cnpj} | Chave: ${chave}`,
    );
    console.log(resultado.empresa);

    // próximo passo:
    // mover arquivo, registrar no banco, etc.
  } catch (error) {
    console.error(`Erro ao processar XML ${caminhoXml}:`, error.message);
  }
}

async function processarXmlsDaPasta() {
  const arquivosXml = listarXmlsDaPasta(DOWNLOAD_DIR);

  console.log(`📄 XMLs encontrados: ${arquivosXml.length}`);

  for (const caminhoXml of arquivosXml) {
    await processarXml(caminhoXml);
  }
}

async function main() {
  const state = carregarState();

  if (!state.historyId) {
    console.log(
      "Nenhum historyId encontrado. Pegando inicial a partir da inbox...",
    );

    const list = await gmail.users.messages.list({
      userId: "me",
      maxResults: 1,
    });

    const messageId = list.data.messages[0].id;

    const email = await gmail.users.messages.get({
      userId: "me",
      id: messageId,
    });

    const historyId = email.data.historyId;

    salvarState(historyId);

    console.log("HistoryId inicial salvo:", historyId);

    return;
  }

  console.log("HistoryId atual:", state.historyId);

  await buscarHistorico(state.historyId);
  await processarXmlsDaPasta();
}

main();
