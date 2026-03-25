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


async function baixarAnexos(emailId) {

  const email = await gmail.users.messages.get({
    userId: "me",
    id: emailId
  });

  const parts = email.data.payload.parts || [];

  for (const part of parts) {

    if (!part.filename) continue;

    const attachment = await gmail.users.messages.attachments.get({
      userId: "me",
      messageId: emailId,
      id: part.body.attachmentId
    });

    const buffer = Buffer.from(attachment.data.data, "base64");

    const filePath = `./downloads/${part.filename}`;

    require("fs").writeFileSync(filePath, buffer);

    console.log("Baixado:", part.filename);
  }
}

baixarAnexos('19cba36bc6c8157f')