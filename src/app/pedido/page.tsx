import { AppShell } from "@/components/AppShell";
import { BookRequestForm } from "@/components/BookRequestForm";

export default function RequestBookPage(){
  return <AppShell><main className="container request-page"><div className="page-head"><div><span className="eyebrow">PEDIDO DE LIVRO</span><h1>Não encontrou o que procura?</h1><p>Envie o título por aqui. O pedido cai na mesma fila dos pedidos feitos pelo bot do Telegram.</p></div></div><div className="request-page-grid"><BookRequestForm/><aside className="card panel request-info"><span className="eyebrow">COMO FUNCIONA</span><h2>Você pede, nós adicionamos.</h2><p>Somente o administrador publica arquivos no acervo. Informe o livro e acompanhe a disponibilidade pelo site ou pelo Telegram.</p><p className="muted">Quando um pedido vinculado ao Telegram for publicado, o bot também poderá enviar o aviso com o link do livro.</p></aside></div></main></AppShell>;
}
