import './globals.css';
import { SocketProvider } from '../context/SocketContext';
import React from 'react';
import { Inter } from 'next/font/google';
import Script from 'next/script';

// Next.js will optimize this font and serve it instantly
const inter = Inter({ subsets: ['latin'], display: 'swap' });
export const metadata = {
  title: 'Table Top - Real-Time Restaurant Ordering',
  description: 'Collaborative QR-code restaurant management system',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.className}>
      <head>
        {process.env.NEXT_PUBLIC_API_URL && (
          <>
            <link rel="preconnect" href={process.env.NEXT_PUBLIC_API_URL} crossOrigin="anonymous" />
            <link rel="dns-prefetch" href={process.env.NEXT_PUBLIC_API_URL} />
          </>
        )}
      </head>
      <body className="antialiased">
        <SocketProvider>
          {children}
        </SocketProvider>
        
        {/* lazyOnload means: Wait until the browser is completely idle before loading this */}
        <Script 
          src="https://www.googletagmanager.com/gtag/js?id=YOUR_ID" 
          strategy="lazyOnload" 
        />
      </body>
    </html>
  );
}
