import Link from "next/link";

export const metadata = {
  title: "Sobre | Biblioteca Virtual",
  description: "Informações sobre a Biblioteca Virtual e seu uso do Google Drive."
};

export default function AboutPage() {
  return (
    <main style={{maxWidth:900,margin:"0 auto",padding:"48px 24px",fontFamily:"system-ui, sans-serif",lineHeight:1.65}}>
      <h1>Biblioteca Virtual</h1>
      <p>
        A Biblioteca Virtual é uma aplicação privada para organização, armazenamento e leitura de livros digitais.
        Usuários autorizados podem acessar a biblioteca, salvar favoritos e acompanhar o progresso de leitura.
      </p>
      <p>
        O Google Drive é utilizado somente para armazenar e recuperar os arquivos de livros enviados pelo administrador.
        O acesso ao Drive é solicitado por OAuth e os arquivos permanecem privados.
      </p>
      <h2>Privacidade e termos</h2>
      <p>
        <Link href="/politica-de-privacidade">Política de Privacidade</Link>
        {" · "}
        <Link href="/termos-de-servico">Termos de Serviço</Link>
      </p>
      <p><Link href="/login">Entrar na Biblioteca Virtual</Link></p>
    </main>
  );
}
