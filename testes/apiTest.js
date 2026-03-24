const express = require("express");
const app = express();

app.use(express.json());

app.post("/gmail/events", (req, res) => {

  const message = req.body.message;

  const data = JSON.parse(
    Buffer.from(message.data, "base64").toString()
  );

  console.log("Evento recebido:");
  console.log(data);

  res.status(200).send("ok");
});

app.listen(3777, () => {
  console.log("Servidor rodando");
});