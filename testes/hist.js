require('dotenv').config();
const { google } = require("googleapis");

const oauth2Client = new google.auth.OAuth2(
  process.env.CLIENT_ID,
  process.env.CLIENT_SECRET
);

oauth2Client.setCredentials({
  refresh_token: process.env.REFRESH_TOKEN,
});

const gmail = google.gmail({
  version: "v1",
  auth: oauth2Client,
});

async function buscarHistorico(historyId) {

  const res = await gmail.users.history.list({
    userId: "me",
    startHistoryId: historyId
  });

  const history = res.data.history || [];

  for (const evento of history) {

    if (!evento.messagesAdded) continue;

    for (const item of evento.messagesAdded) {

      const messageId = item.message.id;

      console.log("Email novo:", messageId);

      await verificarAnexos(messageId);
    }
  }

  console.log(res.data)
}
buscarHistorico(1424)