export async function uploadDriveFileInChunks(uploadUrl:string,file:File,onProgress?:(percent:number)=>void){
  const chunkSize=2*1024*1024;
  let start=0;
  while(start<file.size){
    const end=Math.min(start+chunkSize,file.size);
    const chunk=file.slice(start,end);
    const response=await fetch("/api/drive/upload-chunk",{
      method:"POST",
      headers:{
        "content-type":"application/octet-stream",
        "x-drive-upload-url":uploadUrl,
        "x-upload-start":String(start),
        "x-upload-total":String(file.size),
        "x-upload-mime":file.type||"application/octet-stream"
      },
      body:chunk
    });
    const data=await response.json();
    if(!response.ok)throw new Error(data.error||`Falha no upload (${response.status}).`);
    start=end;
    onProgress?.(Math.round(start/file.size*100));
    if(data.complete){
      if(!data.file?.id)throw new Error("O Google Drive concluiu o upload sem retornar o ID do arquivo.");
      return data.file as {id:string;name?:string;mimeType?:string};
    }
  }
  throw new Error("O upload terminou sem confirmação do Google Drive.");
}
