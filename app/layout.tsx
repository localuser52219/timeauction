import type { Metadata } from 'next'
import './globals.css' // <--- 絕對不能漏掉這一行！

export const metadata: Metadata = {
  title: 'Time Auction',
  description: 'Survival Game',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
