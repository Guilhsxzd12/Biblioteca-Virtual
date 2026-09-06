export const SITE_NAME = "Estante Virtual";
export const SITE_TAGLINE = "Livros para baixar e ler do seu jeito.";

export function bookPath(slug: string) {
  return `/livro/${encodeURIComponent(slug)}`;
}
