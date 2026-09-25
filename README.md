#Pro accounting - Sistema Contabil

## Deploy na Vercel

O projeto inteiro (frontend + API) roda em um único projeto da Vercel, no mesmo
domínio: o frontend é servido como site estático e a API do Fastify roda como
função serverless em `/api` (ver `vercel.json` e `api/index.js`).

A cada deploy, `scripts/vercel-build.mjs` compila o backend, aplica as
migrations pendentes (`prisma migrate deploy`), cria o administrador (se
configurado) e compila o frontend.

### Variáveis de ambiente (Project Settings → Environment Variables)

| Variável         | Obrigatória | Observação                                                                 |
| ---------------- | ----------- | -------------------------------------------------------------------------- |
| `JWT_SECRET`     | sim         | Mínimo de 32 caracteres. Gere com `openssl rand -base64 48`.               |
| `DATABASE_URL`   | sim\*       | \*Dispensável se o Supabase estiver conectado em **Storage** na Vercel: a integração injeta `POSTGRES_PRISMA_URL` e `POSTGRES_URL_NON_POOLING`, que são usadas automaticamente. |
| `DIRECT_URL`     | não         | Conexão usada só pelas migrations, quando `DATABASE_URL` for um pooler em modo transação. |
| `ADMIN_EMAIL`    | não         | Com `ADMIN_PASSWORD`, cria o administrador no deploy. Nunca sobrescreve a senha de um admin existente. |
| `ADMIN_PASSWORD` | não         | Mínimo de 8 caracteres.                                                    |
| `ADMIN_NAME`     | não         | Padrão: "Administrador".                                                   |

Se o banco do Supabase estiver pausado (plano gratuito pausa após inatividade),
restaure-o no painel do Supabase antes do deploy — senão as migrations falham e
o build é cancelado.
