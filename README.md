# GmailAPI - Monitoramento Gmail + validação de XML (NFe) por CNPJ

## Visão geral
Este projeto monitora novos e-mails da conta Gmail usando `historyId`, baixa anexos com extensão `.xml` e `.zip`, e processa XMLs de NFe para validar empresa ativa por CNPJ.

Quando encontra um arquivo `.zip`, ele:
- abre o ZIP;
- mantém apenas arquivos `.xml` internos;
- remove os demais arquivos;
- descarta o ZIP inteiro caso não exista XML dentro.

O estado de processamento é salvo em `history_state.json`, permitindo continuar da última execução.

Além disso, após buscar novos anexos, os XMLs da pasta `downloads/` são processados para:
- extrair a chave de acesso (44 dígitos) do nome do arquivo;
- extrair o CNPJ da chave;
- consultar empresa no cache (JSON/memória) e, se necessário, no PostgreSQL;
- identificar se a empresa está ativa, inativa ou não encontrada.

---

## Como funciona (fluxo)
```mermaid
flowchart TD
  A[Início] --> B[Carrega history_state.json]
  B --> C{Existe historyId?}
  C -- Não --> D[Busca 1 e-mail da inbox]
  D --> E[Obtém historyId]
  E --> F[Salva historyId inicial]
  F --> G[Fim]

  C -- Sim --> H[Chama Gmail History API]
  H --> I{Há messagesAdded?}
  I -- Não --> J[Salva novo historyId]
  J --> K[Lista XMLs em downloads/]

  I -- Sim --> L[Para cada nova mensagem]
  L --> M[Lê assunto e remetente]
  M --> N[Encontra anexos recursivamente]
  N --> O{Anexo é .xml ou .zip?}
  O -- Não --> P[Ignora anexo]
  P --> Q{Ainda há anexos?}

  O -- Sim --> R[Baixa anexo em downloads/]
  R --> S{É .zip?}
  S -- Não --> Q
  S -- Sim --> T[Limpa ZIP mantendo somente XML]
  T --> U{ZIP possui XML?}
  U -- Não --> V[Remove ZIP]
  V --> Q
  U -- Sim --> W[Substitui ZIP pelo limpo]
  W --> Q

  Q -- Sim --> O
  Q -- Não --> X{Há mais mensagens?}
  X -- Sim --> L
  X -- Não --> J

  K --> Y{Há XML para processar?}
  Y -- Não --> G
  Y -- Sim --> Z[Para cada XML]
  Z --> AA[Extrai chave do nome do arquivo]
  AA --> AB{Chave válida?}
  AB -- Não --> AC[Ignora arquivo e registra aviso]
  AC --> AD{Ainda há XML?}
  AB -- Sim --> AE[Extrai CNPJ da chave]
  AE --> AF[Busca empresa no cache]
  AF --> AG{Encontrou no cache?}
  AG -- Sim --> AH[Retorna status ATIVA]
  AG -- Não --> AI[Consulta PostgreSQL por CNPJ]
  AI --> AJ{Empresa existe?}
  AJ -- Não --> AK[Status NAO_ENCONTRADA]
  AJ -- Sim --> AL{Empresa ativa?}
  AL -- Não --> AM[Status INATIVA]
  AL -- Sim --> AN[Adiciona ao cache e status ATIVA]

  AH --> AD
  AK --> AD
  AM --> AD
  AN --> AD
  AD -- Sim --> Z
  AD -- Não --> G
```

1. Carrega `history_state.json`.
2. Se não existir `historyId`, busca um e-mail da inbox e salva o `historyId` inicial.
3. Se já existir `historyId`, chama `gmail.users.history.list` para eventos novos.
4. Para cada mensagem adicionada (`messagesAdded`):
   - lê assunto/remetente;
   - localiza anexos de forma recursiva (`payload.parts`);
   - baixa apenas `.xml` ou `.zip` para a pasta `downloads/`.
5. Se o anexo for ZIP, limpa o conteúdo mantendo apenas XML.
6. Salva o novo `historyId`.
7. Processa todos os XMLs em `downloads/`:
   - extrai chave e CNPJ a partir do nome do arquivo;
   - valida formato da chave;
   - consulta cache de empresas (`empresas_cache.json` + memória);
   - em cache miss, consulta `dbo.empresas_tbl` no banco;
   - registra no log se empresa está `ATIVA`, `INATIVA` ou `NAO_ENCONTRADA`.

---

## Atualizações recentes
- Integração de validação de XML por chave de acesso da NFe.
- Extração de CNPJ direto da chave (posições 7 a 20 da chave de 44 dígitos).
- Implementação de cache híbrido de empresas:
  - memória (`cacheMemoria`);
  - arquivo local `empresas_cache.json`;
  - recarga automática do PostgreSQL quando cache expira.
- Fallback de consulta no banco para CNPJ não encontrado no cache.
- Inclusão de token de integração (`integration_api_token`) no objeto de empresa retornado.

---

## Estrutura principal
- `main.js`: fluxo principal (Gmail API, histórico, download, limpeza de ZIP e processamento de XML).
- `utils.js`: persistência de estado, limpeza de ZIP e utilitários de chave/CNPJ.
- `empresaCache.js`: gerenciamento de cache de empresas e consulta por CNPJ.
- `db.js`: conexão PostgreSQL e executor de queries.
- `empresas_cache.json`: snapshot do cache de empresas (persistência local).
- `history_state.json`: último `historyId` + data da última execução.
- `downloads/`: pasta onde os anexos são salvos.
- `testes/`: scripts auxiliares de teste.

---

## Pré-requisitos
- Node.js 18+ (recomendado).
- Projeto OAuth2 no Google Cloud com Gmail API habilitada.
- `refresh_token` válido da conta Gmail.
- PostgreSQL acessível com tabela `dbo.empresas_tbl`.

---

## Instalação
No diretório do projeto:

```bash
npm install googleapis dotenv adm-zip pg
```

> Se ainda não existir `package.json`, rode antes:
>
> ```bash
> npm init -y
> ```

---

## Configuração (`.env`)
Crie um arquivo `.env` na raiz do projeto com:

```env
CLIENT_ID=seu_client_id
CLIENT_SECRET=seu_client_secret
REFRESH_TOKEN=seu_refresh_token

DB_HOST=localhost
DB_PORT=5432
DB_NAME=seu_banco
DB_USER=postgres
DB_PASSWORD=sua_senha
```

### Escopo necessário
O token OAuth precisa permitir leitura de e-mails (por exemplo, `https://www.googleapis.com/auth/gmail.readonly`).

---

## Execução
```bash
node main.js
```

### Primeira execução
- O sistema salva apenas o `historyId` inicial e encerra.

### Próximas execuções
- O sistema usa o `historyId` salvo para processar somente novidades.

---

## Regras de anexos
### XML (`.xml`)
- É baixado diretamente para `downloads/`.

### ZIP (`.zip`)
- É baixado para `downloads/`.
- Um ZIP “limpo” é criado contendo apenas arquivos `.xml` internos.
- Se não houver XML dentro do ZIP, o arquivo é removido.

---

## Regras de processamento de XML
- A chave da NFe é extraída do nome do arquivo via regex (`\d{44}`).
- Arquivo sem chave válida é ignorado com log de aviso.
- O CNPJ é extraído da chave e consultado no cache/banco.
- Resultados possíveis:
  - `ATIVA`: empresa encontrada e ativa;
  - `INATIVA`: empresa encontrada, porém inativa;
  - `NAO_ENCONTRADA`: empresa não localizada no banco.

---

## Logs esperados
Exemplos de logs durante a execução:
- `HistoryId atual: ...`
- `Novo email detectado: ...`
- `Arquivo salvo: ...`
- `Zip descartado (sem XML)`
- `Zip substituído pelo limpo`
- `📄 XMLs encontrados: ...`
- `✅ Empresa ativa encontrada | CNPJ: ... | Chave: ...`
- `⏸️ Empresa inativa | CNPJ: ... | Chave: ...`
- `❌ Empresa não encontrada | CNPJ: ... | Chave: ...`
- `📦 Cache carregado do JSON`
- `🔄 Cache ausente ou expirado. Recarregando do banco...`

---

## Troubleshooting
- **`invalid_grant` / token inválido**
  - Gere novo `refresh_token` e atualize o `.env`.

- **Sem novos e-mails processados**
  - Verifique se o `historyId` não está muito antigo/inválido.
  - Apague `history_state.json` para forçar nova inicialização.

- **Erro de permissão na pasta `downloads/`**
  - Verifique permissões de escrita no diretório do projeto.

- **Erro de conexão com PostgreSQL**
  - Revise variáveis `DB_*` no `.env`.
  - Valide se o banco está ativo e acessível.

- **Empresa sempre não encontrada**
  - Confirme se o CNPJ extraído existe em `dbo.empresas_tbl`.
  - Verifique se o campo `cnpj` no banco contém o mesmo formato esperado.

---

## Próximas melhorias sugeridas
- Rodar em intervalo automático (cron/agendador).
- Filtrar por remetente/assunto antes de baixar anexos.
- Evitar sobrescrita quando anexos tiverem mesmo nome.
- Mover XMLs processados para pasta de sucesso/erro.
- Adicionar testes automatizados para `utils.js` e `empresaCache.js`.
