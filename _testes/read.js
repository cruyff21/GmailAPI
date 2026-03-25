const { google } = require("googleapis");

const CLIENT_ID =
  "";
const CLIENT_SECRET = "";

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET);

oauth2Client.setCredentials({
  refresh_token:
    "",
});

const gmail = google.gmail({
  version: "v1",
  auth: oauth2Client,
});

async function listarEmails() {
  const email = await gmail.users.messages.get({
    userId: "me",
    id: "19cba36bc6c8157f",
  });

  console.log(JSON.stringify(email.data, null, 2));

  const headers = email.data.payload.headers;

  const subject = headers.find((h) => h.name === "Subject")?.value;
  const from = headers.find((h) => h.name === "From")?.value;

  console.log({
    id: email.data.id,
    from,
    subject,
  });
}

listarEmails();