require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') })
const axios = require("axios");

function obterPeriodosQuinzena(dataBase = new Date()) {
  const ano = dataBase.getFullYear();
  const mes = dataBase.getMonth(); // 0-11

  // último dia do mês (truque clássico)
  const ultimoDiaMes = new Date(ano, mes + 1, 0).getDate();

  // função pra formatar em DD/MM/YYYY
  const formatar = (dia) => {
    const d = String(dia).padStart(2, "0");
    const m = String(mes + 1).padStart(2, "0");
    return `${d}/${m}/${ano}`;
  };

  return {
    primeiraQuinzena: {
      dataini: formatar(1),
      datafim: formatar(15),
    },
    segundaQuinzena: {
      dataini: formatar(16),
      datafim: formatar(ultimoDiaMes),
    },
  };
}

function obterQuinzenaAtual(dataBase = new Date()) {
  const periodos = obterPeriodosQuinzena(dataBase);
  const diaAtual = dataBase.getDate();

  if (diaAtual <= 15) {
    return periodos.primeiraQuinzena;
  }

  return periodos.segundaQuinzena;
}

async function enviarXmlPorEmail() {
  const baseUrl =
    "https://api.torge.com.br:8443/servidor/arquivosfiscais/arquivosxml/enviaremail";

  const periodos = obterQuinzenaAtual();

  const params = {
    dataini: periodos.dataini,
    datafim: periodos.datafim,
    mdfe: false,
    mdfecanceladas: true,
    mdfeeventos: true,
    nfe: true,
    nfesepararoperacao: false,
    nfecanceladas: true,
    nfecartascorrecao: true,
    nfeinutilizacoes: true,
    nfemanifestacoes: true,
    compras: false,
    comprasreferencia: "emissao",
    comprascanceladas: true,
    nfce: true,
    nfcesepararcaixa: false,
    nfcereferencia: true,
    nfcecanceladas: true,
    nfceinutilizacoes: true,
    nfcecontingencia: true,
    blocox: false,
    blocoxsepararimpressora: true,
    blocoxpendenteserro: true,
    blocoxultimoestoque: false,
    nfse: false,
    nfsecanceladas: true,
  };

  const body = {
    assunto: `Arquivo XMLs de ${periodos.dataini} - ${periodos.datafim}`,
    corpo: "Segue em anexo o arquivo .zip contendo os xmls.",
    destinatarios: ["adrieneestevam50@gmail.com"],
  };

  const headers = {
    "Api-Key": process.env.API_KEY,
    Authorization: process.env.AUTH_TOKEN,
    "Content-Type": "application/json",
    Origin: "https://app.torge.com.br",
    Referer: "https://app.torge.com.br/",
  };

  try {
    const response = await axios.post(baseUrl, body, {
      params,
      headers,
      timeout: 60000,
    });

    console.log("Status:", response.status);
    console.log("Resposta:", response.data);
  } catch (error) {
    if (error.response) {
      console.error("Status de erro:", error.response.status);
      console.error("Resposta de erro:", error.response.data);
      return;
    }

    if (error.request) {
      console.error("A requisição foi enviada, mas não houve resposta.");
      return;
    }

    console.error("Erro ao montar/enviar a requisição:", error.message);
  }
}


//obterQuinzenaAtual();

enviarXmlPorEmail();
