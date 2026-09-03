import "server-only";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

const DRIVE_SCOPE="https://www.googleapis.com/auth/drive";

function googleConfig(){
  const clientId=process.env.GOOGLE_CLIENT_ID;
  const clientSecret=process.env.GOOGLE_CLIENT_SECRET;
  if(!clientId||!clientSecret)throw new Error("Google OAuth não configurado.");
  return {clientId,clientSecret};
}

export function makeGoogleAuthUrl(origin:string,state:string){
  const {clientId}=googleConfig();
  const params=new URLSearchParams({
    client_id:clientId,
    redirect_uri:`${origin}/api/drive/oauth/callback`,
    response_type:"code",
    access_type:"offline",
    prompt:"select_account consent",
    include_granted_scopes:"true",
    scope:`${DRIVE_SCOPE} openid email`,
    state
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function exchangeGoogleCode(code:string,origin:string){
  const {clientId,clientSecret}=googleConfig();
  const response=await fetch("https://oauth2.googleapis.com/token",{
    method:"POST",
    headers:{"content-type":"application/x-www-form-urlencoded"},
    body:new URLSearchParams({code,client_id:clientId,client_secret:clientSecret,redirect_uri:`${origin}/api/drive/oauth/callback`,grant_type:"authorization_code"}),
    cache:"no-store"
  });
  if(!response.ok)throw new Error(`Falha ao conectar Google Drive (${response.status}).`);
  return response.json() as Promise<{access_token:string;refresh_token?:string;expires_in:number;scope:string;token_type:string;id_token?:string}>;
}

export async function getGoogleAccessToken(){
  const admin=createAdminSupabaseClient();
  const {data,error}=await admin.from("app_integrations").select("refresh_token").eq("provider","google_drive").maybeSingle();
  if(error)throw error;
  if(!data?.refresh_token)throw new Error("GOOGLE_DRIVE_NOT_CONNECTED");
  const {clientId,clientSecret}=googleConfig();
  const response=await fetch("https://oauth2.googleapis.com/token",{
    method:"POST",
    headers:{"content-type":"application/x-www-form-urlencoded"},
    body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,refresh_token:data.refresh_token,grant_type:"refresh_token"}),
    cache:"no-store"
  });
  if(!response.ok)throw new Error(`Não foi possível renovar o acesso ao Drive (${response.status}).`);
  return ((await response.json()) as {access_token:string}).access_token;
}

async function driveJson<T>(token:string,url:string,init?:RequestInit){
  const response=await fetch(url,{...init,headers:{authorization:`Bearer ${token}`,...(init?.headers||{})},cache:"no-store"});
  if(!response.ok){
    const text=await response.text();
    throw new Error(`Google Drive ${response.status}: ${text.slice(0,300)}`);
  }
  return response.json() as Promise<T>;
}

function esc(v:string){
  return v.replace(/\\/g,"\\\\").replace(/'/g,"\\'");
}

async function findOrCreateChildFolder(token:string,name:string,parentId:string){
  const q=encodeURIComponent(`name='${esc(name)}' and '${esc(parentId)}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const result=await driveJson<{files:{id:string}[]}>(token,`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&pageSize=10`);
  if(result.files?.[0]?.id)return result.files[0].id;
  const created=await driveJson<{id:string}>(token,"https://www.googleapis.com/drive/v3/files?fields=id",{
    method:"POST",
    headers:{"content-type":"application/json"},
    body:JSON.stringify({name,mimeType:"application/vnd.google-apps.folder",parents:[parentId]})
  });
  return created.id;
}

export async function findOrCreateRootFolder(token:string){
  const configured=process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID?.trim();
  if(configured)return configured;
  const q=encodeURIComponent("name='BIBLIOTECA VIRTUAL' and mimeType='application/vnd.google-apps.folder' and trashed=false");
  const result=await driveJson<{files:{id:string}[]}>(token,`https://www.googleapis.com/drive/v3/files?q=${q}&spaces=drive&fields=files(id)&pageSize=10`);
  if(result.files?.[0]?.id)return result.files[0].id;
  const created=await driveJson<{id:string}>(token,"https://www.googleapis.com/drive/v3/files?fields=id",{
    method:"POST",
    headers:{"content-type":"application/json"},
    body:JSON.stringify({name:"BIBLIOTECA VIRTUAL",mimeType:"application/vnd.google-apps.folder"})
  });
  return created.id;
}

export async function findOrCreateLetterFolder(token:string,letter:string){
  const root=await findOrCreateRootFolder(token);
  const safe=/^[A-Z]$/.test(letter)?letter:"#";
  return findOrCreateChildFolder(token,safe,root);
}

export async function findOrCreateCoversFolder(token:string){
  const root=await findOrCreateRootFolder(token);
  return findOrCreateChildFolder(token,"CAPAS",root);
}

async function findOrCreateUserFolder(token:string,userId:string,kind:"EBOOKS"|"CAPAS"){
  const root=await findOrCreateRootFolder(token);
  const users=await findOrCreateChildFolder(token,"USUARIOS",root);
  const user=await findOrCreateChildFolder(token,userId,users);
  return findOrCreateChildFolder(token,kind,user);
}

async function startResumableUpload(token:string,p:{fileName:string;mimeType:string;fileSize:number;folderId:string}){
  const response=await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,mimeType,webViewLink",{
    method:"POST",
    headers:{
      authorization:`Bearer ${token}`,
      "content-type":"application/json; charset=UTF-8",
      "x-upload-content-type":p.mimeType||"application/octet-stream",
      "x-upload-content-length":String(p.fileSize)
    },
    body:JSON.stringify({name:p.fileName,mimeType:p.mimeType||"application/octet-stream",parents:[p.folderId]})
  });
  if(!response.ok)throw new Error(`Não foi possível iniciar o upload no Drive (${response.status}).`);
  const uploadUrl=response.headers.get("location");
  if(!uploadUrl)throw new Error("Google Drive não retornou a sessão de upload.");
  return uploadUrl;
}

export async function createResumableUpload(p:{fileName:string;mimeType:string;fileSize:number;letter:string}){
  const token=await getGoogleAccessToken();
  const folderId=await findOrCreateLetterFolder(token,p.letter);
  const uploadUrl=await startResumableUpload(token,{...p,folderId});
  return {uploadUrl,folderId};
}

export async function createUserBookResumableUpload(p:{userId:string;fileName:string;mimeType:string;fileSize:number}){
  const token=await getGoogleAccessToken();
  const folderId=await findOrCreateUserFolder(token,p.userId,"EBOOKS");
  const uploadUrl=await startResumableUpload(token,{fileName:p.fileName,mimeType:p.mimeType,fileSize:p.fileSize,folderId});
  return {uploadUrl,folderId};
}

async function uploadFileToFolder(file:File,folderId:string){
  const token=await getGoogleAccessToken();
  const safeBase=file.name.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9._-]+/g,"-").replace(/-+/g,"-").replace(/^-|-$/g,"")||"arquivo";
  const fileName=`${Date.now()}-${safeBase}`;
  const mimeType=file.type||"application/octet-stream";
  const uploadUrl=await startResumableUpload(token,{fileName,mimeType,fileSize:file.size,folderId});
  const response=await fetch(uploadUrl,{method:"PUT",headers:{"content-type":mimeType,"content-length":String(file.size)},body:await file.arrayBuffer()});
  if(!response.ok){
    const text=await response.text();
    throw new Error(`Upload falhou (${response.status}): ${text.slice(0,180)}`);
  }
  const uploaded=await response.json() as {id:string;name:string;mimeType:string};
  if(!uploaded.id)throw new Error("Google Drive não retornou o ID do arquivo.");
  return uploaded;
}

export async function uploadCoverToDrive(file:File){
  const token=await getGoogleAccessToken();
  const folderId=await findOrCreateCoversFolder(token);
  return uploadFileToFolder(file,folderId);
}

export async function uploadUserCoverToDrive(file:File,userId:string){
  const token=await getGoogleAccessToken();
  const folderId=await findOrCreateUserFolder(token,userId,"CAPAS");
  return uploadFileToFolder(file,folderId);
}

export async function fetchDriveFile(fileId:string,range?:string|null){
  const token=await getGoogleAccessToken();
  const response=await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,{
    headers:{authorization:`Bearer ${token}`,...(range?{range}:{})},
    cache:"no-store"
  });
  if(!response.ok&&response.status!==206)throw new Error(`Falha ao ler arquivo do Drive (${response.status}).`);
  return response;
}
