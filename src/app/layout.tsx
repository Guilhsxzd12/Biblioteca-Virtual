import type { Metadata,Viewport } from "next";
import "./globals.css";

export const metadata:Metadata={title:"Biblioteca Virtual",description:"Sua biblioteca particular, organizada e sempre ao seu alcance."};
export const viewport:Viewport={width:"device-width",initialScale:1,maximumScale:1,userScalable:false,viewportFit:"cover"};

export default function RootLayout({children}:{children:React.ReactNode}){
  return <html lang="pt-BR"><body>{children}</body></html>;
}
