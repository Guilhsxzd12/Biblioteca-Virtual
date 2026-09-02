import type { Metadata } from "next";
import "./globals.css";
export const metadata:Metadata={title:"Biblioteca Virtual",description:"Sua biblioteca particular, organizada e sempre ao seu alcance."};
export default function RootLayout({children}:{children:React.ReactNode}){ return <html lang="pt-BR"><body>{children}</body></html>; }
