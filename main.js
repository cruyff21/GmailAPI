require("dotenv").config();

const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");
const {
  salvarState,
  carregarState,
  limparZipMantendoSomenteXml,
  listarArquivosProcessaveis,
  chavePareceValida,
  extrairChaveDoNomeArquivo,
  extrairCnpjDaChave,
  enviarArquivoParaApi,
  agruparXmlsDoZipPorEmpresa,
  criarZipPorEmpresa
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

    const empresa = resultado.empresa;

    if (!empresa.integration_api_token) {
      console.log(
        `⚠️ Empresa sem token | CNPJ: ${cnpj} | id_empresa: ${empresa.id_empresa}`,
      );
      return;
    }

    console.log(`✅ Empresa encontrada | CNPJ: ${cnpj} | Chave: ${chave}`);
    //console.log(empresa);

    const retornoApi = await enviarArquivoParaApi(
      caminhoXml,
      empresa.integration_api_token,
    );

    console.log(
      `🚀 XML enviado com sucesso | Arquivo: ${path.basename(caminhoXml)}`,
    );
    console.log(retornoApi);

    // Deletar arquivo após upload bem-sucedido
    fs.unlinkSync(caminhoXml);
    console.log(`🗑️ Arquivo removido: ${path.basename(caminhoXml)}`);
  } catch (error) {
    console.error(`Erro ao processar XML ${caminhoXml}:`, error.message);

    if (error.response) {
      console.error("Status da API:", error.response.status);
      console.error("Resposta da API:", error.response.data);
    }
  }
}

async function processarZip(caminhoZip) {
  try {
    const grupos = await agruparXmlsDoZipPorEmpresa(caminhoZip);
    const listaGrupos = Object.values(grupos);

    if (listaGrupos.length === 0) {
      console.log(`Nenhum XML válido encontrado em ${path.basename(caminhoZip)}`);
      return;
    }

    if (listaGrupos.length === 1) {
      const grupo = listaGrupos[0];
      const empresa = grupo.empresa;

      if (!empresa.integration_api_token) {
        console.log(`Empresa sem token | id_empresa: ${empresa.id_empresa}`);
        return;
      }

      const retornoApi = await enviarArquivoParaApi(
        caminhoZip,
        empresa.integration_api_token
      );

      console.log(`ZIP original enviado: ${path.basename(caminhoZip)}`);
      console.log(retornoApi);

      // Deletar ZIP original após upload bem-sucedido
      fs.unlinkSync(caminhoZip);
      console.log(`🗑️ ZIP removido: ${path.basename(caminhoZip)}`);
      return;
    }

    const pastaTemp = path.join(__dirname, "temp_zips");
    if (!fs.existsSync(pastaTemp)) {
      fs.mkdirSync(pastaTemp, { recursive: true });
    }

    const nomeBase = path.basename(caminhoZip, path.extname(caminhoZip));

    for (const grupo of listaGrupos) {
      const empresa = grupo.empresa;

      if (!empresa.integration_api_token) {
        console.log(`Empresa sem token | id_empresa: ${empresa.id_empresa}`);
        continue;
      }

      const zipSeparado = criarZipPorEmpresa(
        nomeBase,
        empresa,
        grupo.xmls,
        pastaTemp
      );

      const retornoApi = await enviarArquivoParaApi(
        zipSeparado,
        empresa.integration_api_token
      );

      console.log(`ZIP separado enviado: ${path.basename(zipSeparado)}`);
      console.log(retornoApi);

      // Deletar ZIP separado após upload bem-sucedido
      fs.unlinkSync(zipSeparado);
      console.log(`🗑️ ZIP temporário removido: ${path.basename(zipSeparado)}`);
    }

    // Deletar ZIP original após processar todos os grupos
    fs.unlinkSync(caminhoZip);
    console.log(`🗑️ ZIP original removido: ${path.basename(caminhoZip)}`);

    // Limpar pasta temp_zips se estiver vazia
    if (fs.readdirSync(pastaTemp).length === 0) {
      fs.rmdirSync(pastaTemp);
      console.log(`🗑️ Pasta temp_zips removida (vazia)`);
    }
  } catch (error) {
    console.error(`Erro ao processar ZIP ${caminhoZip}:`, error.message);
  }
}

async function processarArquivosDaPasta() {
  const arquivos = listarArquivosProcessaveis(DOWNLOAD_DIR);

  console.log(`📦 Arquivos encontrados: ${arquivos.length}`);

  for (const caminhoArquivo of arquivos) {
    const lower = caminhoArquivo.toLowerCase();

    if (lower.endsWith(".xml")) {
      await processarXml(caminhoArquivo);
      continue;
    }

    if (lower.endsWith(".zip")) {
      await processarZip(caminhoArquivo);
      continue;
    }

    console.log(`⚠️ Arquivo ignorado: ${path.basename(caminhoArquivo)}`);
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
  await processarArquivosDaPasta();
}

main();
