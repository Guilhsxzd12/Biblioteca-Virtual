import { NextResponse } from "next/server";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

export const dynamic="force-dynamic";

export async function GET(){
  let browser:Awaited<ReturnType<typeof puppeteer.launch>>|null=null;
  try{
    chromium.setGraphicsMode=false;
    browser=await puppeteer.launch({
      args:await puppeteer.defaultArgs({args:chromium.args,headless:"shell"}),
      executablePath:await chromium.executablePath(),
      headless:"shell"
    });
    const page=await browser.newPage();
    await page.setContent("<!doctype html><html><body><h1>Chromium OK</h1></body></html>",{waitUntil:"load"});
    const pdf=await page.pdf({format:"A4"});
    return NextResponse.json({ok:true,pdfBytes:pdf.byteLength});
  }catch(error){
    return NextResponse.json({ok:false,error:error instanceof Error?error.message:String(error)},{status:500});
  }finally{
    if(browser)try{await browser.close();}catch{}
  }
}
