require('dotenv').config();
const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REFRESH_TOKEN = process.env.REFRESH_TOKEN;
const DOWNLOAD_DIR = "./downloads";

if (!fs.existsSync(DOWNLOAD_DIR)) {
  fs.mkdirSync(DOWNLOAD_DIR);
}

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET);

oauth2Client.setCredentials({
  refresh_token: REFRESH_TOKEN,
});

const gmail = google.gmail({
  version: "v1",
  auth: oauth2Client,
});

function getHeader(headers, name) {
  return headers.find((h) => h.name === name)?.value;
}



async function buscarEmails() {

  const res = await gmail.users.messages.list({
    userId: "me",
    q: "has:attachment",
    maxResults: 10,
  });

  const messages = res.data.messages || [];

  console.log("Mensagens encontradas:", messages.length);

  for (const msg of messages) {
    await processarEmail(msg.id);
  }
}

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
    messageId: messageId,
    id: part.body.attachmentId,
  });

  const buffer = Buffer.from(attachment.data.data, "base64");

  const filePath = path.join(DOWNLOAD_DIR, part.filename);

  fs.writeFileSync(filePath, buffer);

  console.log("Arquivo salvo:", filePath);
}

async function processarEmail(emailId) {

  const email = await gmail.users.messages.get({
    userId: "me",
    id: emailId,
  });

  const headers = email.data.payload.headers;

  const subject = getHeader(headers, "Subject");
  const from = getHeader(headers, "From");

  console.log("\nEmail:");
  console.log({
    id: emailId,
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

    if (
      filename.endsWith(".xml") ||
      filename.endsWith(".zip") ||
      filename.endsWith(".rar")
    ) {
      await baixarAnexo(emailId, part);
    }
  }
}

buscarEmails();