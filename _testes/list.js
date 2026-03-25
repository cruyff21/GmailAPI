require('dotenv').config();
const { google } = require("googleapis");

//console.log(process.env.REFRESH_TOKEN)


const oauth2Client = new google.auth.OAuth2(
  process.env.CLIENT_ID,
  process.env.CLIENT_SECRET
);

oauth2Client.setCredentials({
  refresh_token: process.env.REFRESH_TOKEN,
});

const gmail = google.gmail({
  version: "v1",
  auth: oauth2Client
});

async function listarEmails() {
  const res = await gmail.users.messages.list({
    userId: "me",
    //maxResults: 5,
    
  });

  console.log(res.data);
}

async function pegarHistoryId() {

  const list = await gmail.users.messages.list({
    userId: "me",
    maxResults: 1
  });

  const messageId = list.data.messages[0].id;

  const email = await gmail.users.messages.get({
    userId: "me",
    id: messageId
  });

  console.log("HistoryId:", email.data.historyId);
}


listarEmails()
//pegarHistoryId();
