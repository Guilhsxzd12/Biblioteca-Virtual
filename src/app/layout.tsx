import type { Metadata,Viewport } from "next";
import "./globals.css";
import "./responsive.css";
import "./kindle-books.css";
import { SITE_NAME,SITE_TAGLINE } from "@/lib/site";

export const metadata:Metadata={title:{default:SITE_NAME,template:`%s | ${SITE_NAME}`},description:SITE_TAGLINE};
export const viewport:Viewport={width:"device-width",initialScale:1,maximumScale:1,userScalable:false,viewportFit:"cover"};

export default function RootLayout({children}:{children:React.ReactNode}){
  return <html lang="pt-BR"><body>{children}</body></html>;
}
