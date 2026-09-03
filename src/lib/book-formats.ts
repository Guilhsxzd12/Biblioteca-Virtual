import "server-only";

function isPdf(name:string,mime:string){return mime==="application/pdf"||name.toLowerCase().endsWith(".pdf");}
function isEpub(name:string,mime:string){return mime==="application/epub+zip"||name.toLowerCase().endsWith(".epub");}

export function hasPdfAndEpub(book:{file_name?:string|null;mime_type?:string|null;reading_pdf_drive_file_id?:string|null;reading_pdf_file_name?:string|null;kindle_drive_file_id?:string|null;kindle_file_name?:string|null}){
  const primaryName=String(book.file_name||"");
  const primaryMime=String(book.mime_type||"");
  const hasPdf=isPdf(primaryName,primaryMime)||Boolean(book.reading_pdf_drive_file_id&&book.reading_pdf_file_name);
  const hasEpub=isEpub(primaryName,primaryMime)||Boolean(book.kindle_drive_file_id&&book.kindle_file_name);
  return hasPdf&&hasEpub;
}

export function hasManualReadingPdf(book:{file_name?:string|null;mime_type?:string|null;reading_pdf_drive_file_id?:string|null;reading_pdf_file_name?:string|null}){
  const primaryName=String(book.file_name||"");
  const primaryMime=String(book.mime_type||"");
  return isPdf(primaryName,primaryMime)||Boolean(book.reading_pdf_drive_file_id&&book.reading_pdf_file_name);
}

export function hasOriginalEpub(book:{file_name?:string|null;mime_type?:string|null}){
  return isEpub(String(book.file_name||""),String(book.mime_type||""));
}
