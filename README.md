# Biblioteca Virtual

Biblioteca privada em Next.js + Supabase + Google Drive.

## Recursos

- Login/cadastro privado e aprovação de usuários.
- Biblioteca, favoritos e progresso de leitura.
- Painel administrativo de livros, categorias e usuários.
- Busca automática de metadados por título com Google Books e fallback Open Library.
- Nome do arquivo acompanha o título em tempo real: `Crônicas de Fogo` → `Cronicas-de-Fogo.pdf`.
- Upload resumível direto para o Google Drive.
- Organização automática em `BIBLIOTECA VIRTUAL/A`, `B`, `C` ... `Z`.
- PDFs continuam privados no Drive e são servidos apenas para usuários autorizados.

## Produção

Domínio principal atual: `https://biblioteca-virtual-umber.vercel.app`

## Variáveis da Vercel

Use `.env.example` como referência. Nunca envie segredos para o GitHub.

Supabase:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Google OAuth:
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_DRIVE_ROOT_FOLDER_ID` (opcional; o site procura `BIBLIOTECA VIRTUAL` se ficar vazio)

No Google Cloud, habilite a Google Drive API, crie um OAuth Client ID do tipo Web e adicione como redirect URI:

`https://biblioteca-virtual-umber.vercel.app/api/drive/oauth/callback`

Depois acesse Admin → Google Drive → Conectar Google Drive.
