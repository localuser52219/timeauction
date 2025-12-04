import type { Metadata } from 'next'
import './globals.css' // 匯入全域樣式 (Tailwind)

export const metadata: Metadata = {
  title: 'Time Auction',
  description: 'Time Auction Game App',
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
