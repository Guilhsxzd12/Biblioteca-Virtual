import { AppShell } from "@/components/AppShell";

const faqs=[
  {
    q:"Como enviar um livro ao meu Kindle?",
    a:"Abra Enviar ao Kindle, pesquise o livro, selecione o arquivo EPUB e salve. Depois toque em Enviar ao Kindle. No celular, a Biblioteca Virtual abre o menu nativo de compartilhamento com o EPUB anexado; escolha o app Kindle para concluir o envio."
  },
  {
    q:"Qual formato é suportado pela Biblioteca Virtual para o Kindle?",
    a:"Para o fluxo Enviar ao Kindle, usamos EPUB. O site verifica se o arquivo realmente é um EPUB antes de salvá-lo e aceita arquivos de até 200 MB. Isso evita que um arquivo com extensão errada seja enviado como se fosse compatível."
  },
  {
    q:"Por que o Kindle não aparece no menu de compartilhamento?",
    a:"Confira se o app Kindle está instalado no celular. No iPhone ou Android, abra Mais/Outros no menu de compartilhamento e procure Kindle. Se o navegador não permitir compartilhar arquivos diretamente, a Biblioteca Virtual oferece o download do EPUB como alternativa."
  },
  {
    q:"Quem consegue ver o e-book que eu enviei?",
    a:"O e-book aparece primeiro na sua Minha Biblioteca e entra na fila de moderação do administrador. O administrador pode mantê-lo Privado, deixando-o visível apenas para você, ou aprová-lo para o Catálogo da Biblioteca."
  },
  {
    q:"Onde ficam armazenados os meus arquivos?",
    a:"Os EPUBs e capas enviados ficam armazenados de forma privada no Google Drive conectado à Biblioteca Virtual, em uma pasta separada para cada usuário. Outros usuários não recebem acesso direto ao arquivo do Drive."
  },
  {
    q:"A capa enviada também vai para o Kindle?",
    a:"A capa que você envia no site é usada pela Biblioteca Virtual. No Kindle, a capa exibida normalmente é a capa incorporada dentro do próprio arquivo EPUB."
  },
  {
    q:"O que acontece depois que um livro é aprovado para o catálogo?",
    a:"O mesmo arquivo passa a aparecer no Acervo da Biblioteca para os usuários aprovados, dentro da categoria escolhida. Não é necessário enviar outra cópia do EPUB."
  },
  {
    q:"Meu upload falhou. O que devo verificar?",
    a:"Confirme se o arquivo termina em .epub, se possui até 200 MB e se sua conexão com a internet está estável. Tente novamente sem fechar a página durante o envio."
  }
];

export default function HelpPage(){
  return <AppShell><main className="container help-page">
    <div className="page-head"><div><h1>Precisa de ajuda?</h1><p>Respostas rápidas sobre a Biblioteca Virtual e o envio de e-books ao Kindle.</p></div></div>
    <section className="help-intro card panel">
      <div className="help-badge">?</div>
      <div><h2>Central de ajuda</h2><p className="muted">Toque em uma pergunta para abrir a resposta.</p></div>
    </section>
    <section className="faq-list">
      {faqs.map((item,index)=><details className="card faq-item" key={item.q} open={index===0}>
        <summary>{item.q}<span>+</span></summary>
        <div className="faq-answer">{item.a}</div>
      </details>)}
    </section>
  </main></AppShell>;
}
