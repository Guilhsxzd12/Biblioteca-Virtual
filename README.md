# Estante Virtual

Biblioteca digital privada em Next.js + Supabase + Google Drive + Telegram.

## Recursos

- Login privado com contas criadas pelo administrador.
- Catálogo, pesquisa, favoritos e downloads em PDF/EPUB.
- URLs legíveis por título, como `/livro/a-guerra-dos-tronos`.
- Painel administrativo de livros, categorias, usuários e pedidos.
- Bot do Telegram para baixar livros e enviar pedidos.
- Busca automática de metadados por título com Google Books e fallback Open Library.
- Nome do arquivo acompanha o título em tempo real: `Crônicas de Fogo` → `Cronicas-de-Fogo.pdf`.
- Upload resumível direto para o Google Drive.
- Organização automática em `BIBLIOTECA VIRTUAL/A`, `B`, `C` ... `Z`.
- Arquivos continuam privados no Drive e são servidos apenas para assinantes autorizados.

## Produção

Domínio principal atual: `https://biblioteca-virtual-umber.vercel.app`

Domínio personalizado reservado: `https://estantevirtual.shop` (ativar após a propagação do DNS).

Páginas públicas para Google OAuth:
- `https://biblioteca-virtual-cineclubs-projects.vercel.app/sobre`
- `https://biblioteca-virtual-cineclubs-projects.vercel.app/politica-de-privacidade`
- `https://biblioteca-virtual-cineclubs-projects.vercel.app/termos-de-servico`

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

`https://biblioteca-virtual-cineclubs-projects.vercel.app/api/drive/oauth/callback`

Depois acesse Admin → Google Drive → Conectar Google Drive.

<!-- redeploy: OAuth env configured -->
