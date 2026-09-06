import { AppShell } from "@/components/AppShell";

const faqs=[
  {q:"Como baixo um livro?",a:"Abra o título desejado e escolha Baixar PDF ou Baixar EPUB. O arquivo vai para o seu aparelho e você poderá abri-lo no aplicativo de leitura que preferir."},
  {q:"Qual é a diferença entre PDF e EPUB?",a:"O PDF mantém a diagramação fixa da página. O EPUB adapta o texto à tela e costuma funcionar melhor em aplicativos e leitores digitais."},
  {q:"O site abre EPUB?",a:"Não. Para evitar incompatibilidades entre aparelhos, a Estante Virtual entrega o arquivo original. Você escolhe seu aplicativo preferido para a leitura."},
  {q:"Como faço um pedido?",a:"Abra o bot do Telegram, toque em Pedir livro e informe título, autor e idioma. O pedido aparecerá para o administrador."},
  {q:"Como saberei que meu pedido chegou?",a:"Quando o administrador publicar o livro pedido, o bot enviará automaticamente uma mensagem com o link direto do título."},
  {q:"Posso usar minha conta em outro Telegram?",a:"Sim, mas primeiro use Sair / Trocar conta no chat atualmente vinculado. Uma conta pode permanecer ligada a somente um Telegram por vez."},
  {q:"Minha assinatura venceu. O que faço?",a:"Consulte Minha assinatura no bot, faça a renovação e envie o comprovante ao atendimento. O administrador liberará o novo período."}
];

export default function HelpPage(){return <AppShell><main className="container help-page"><div className="page-head"><div><span className="eyebrow">CENTRAL DE AJUDA</span><h1>Como podemos ajudar?</h1><p>Respostas rápidas sobre downloads, pedidos, assinatura e Telegram.</p></div></div><section className="faq-list">{faqs.map((item,index)=><details className="card faq-item" key={item.q} open={index===0}><summary>{item.q}<span>+</span></summary><div className="faq-answer">{item.a}</div></details>)}</section></main></AppShell>;}
