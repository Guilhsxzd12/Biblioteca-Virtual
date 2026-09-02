export function slugifyTitle(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").replace(/-+/g, "-");
}

export function driveFileName(title: string, originalName?: string) {
  const base = slugifyTitle(title) || "Livro";
  const ext = originalName?.match(/(\.[a-zA-Z0-9]+)$/)?.[1]?.toLowerCase() || ".pdf";
  return `${base}${ext}`;
}

export function driveLetter(title: string) {
  const first = slugifyTitle(title).charAt(0).toUpperCase();
  return /^[A-Z]$/.test(first) ? first : "#";
}
