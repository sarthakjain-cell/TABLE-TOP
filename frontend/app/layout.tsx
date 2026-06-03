import './globals.css';
import { SocketProvider } from '../context/SocketContext';
import React from 'react';

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
    <html lang="en">
      <body className="antialiased">
        <SocketProvider>
          {children}
        </SocketProvider>
      </body>
    </html>
  );
}
