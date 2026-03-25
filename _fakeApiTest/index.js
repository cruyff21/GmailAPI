require("dotenv").config();

const express = require("express");
const multer = require("multer");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.json());

const PORT = 3000;
const JWT_SECRET = 'ttkaaaaaaaaaaa';

const uploadDir = path.join(__dirname, "uploads");

// garante que a pasta uploads exista
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

/**
 * Middleware JWT
 * Espera header:
 * Authorization: Bearer SEU_TOKEN
 */
function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ error: "Token não enviado." });
    }

    const [type, token] = authHeader.split(" ");

    if (type !== "Bearer" || !token) {
      return res.status(401).json({ error: "Formato do token inválido." });
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    if (!decoded.code) {
      return res.status(403).json({ error: "Token sem code da empresa." });
    }

    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: "Token inválido ou expirado." });
  }
}

/**
 * Configuração do multer
 */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  },
});

function fileFilter(req, file, cb) {
  const allowedExt = [".xml", ".zip"];
  const ext = path.extname(file.originalname).toLowerCase();

  if (!allowedExt.includes(ext)) {
    return cb(new Error("Apenas arquivos .xml ou .zip são permitidos."));
  }

  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 20 * 1024 * 1024, // 20 MB
  },
});

/**
 * Rota para upload
 */
app.post("/upload", authMiddleware, upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Nenhum arquivo enviado." });
  }

  return res.status(200).json({
    message: "Arquivo enviado com sucesso.",
    empresaCode: req.user.code,
  });
});

/**
 * Rota para gerar token de teste
 * Só para ambiente local / desenvolvimento
 */
app.post("/token-teste", (req, res) => {
  const { code } = req.body;

  if (!code) {
    return res.status(400).json({ error: "Informe o code da empresa." });
  }

  const token = jwt.sign(
    {
      code,
    },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  return res.json({ token });
});

/**
 * Middleware global de erro
 */
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ error: "Arquivo excede o limite de 20 MB." });
    }

    return res.status(400).json({ error: err.message });
  }

  if (err) {
    return res.status(400).json({ error: err.message });
  }

  next();
});

app.listen(PORT, () => {
  console.log(`API rodando em http://localhost:${PORT}`);
});