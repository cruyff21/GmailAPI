const { google } = require("googleapis");

const CLIENT_ID = "";
const CLIENT_SECRET = "";

const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
);

oauth2Client.setCredentials({
  refresh_token: ""
});

const gmail = google.gmail({
  version: "v1",
  auth: oauth2Client
});



async function ativarWatch() {

  try {

    const response = await gmail.users.watch({
      userId: "me",
      requestBody: {
        topicName: "projects/gen-lang-client-0877199179/topics/gmail-notifications",
        labelIds: ["INBOX"],
        labelFilterAction: "include"
      }
    });

    const historyId = response.data.historyId;
    const expiration = response.data.expiration;

    console.log("Watch ativado com sucesso");
    console.log("HistoryId inicial:", historyId);

    const expirationDate = new Date(Number(expiration));

    console.log("Expira em:", expirationDate);

  } catch (error) {

    console.error("Erro ao ativar watch:");

    if (error.response) {
      console.error(error.response.data);
    } else {
      console.error(error);
    }

  }
}

ativarWatch()