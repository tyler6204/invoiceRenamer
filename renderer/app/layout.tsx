import React from 'react'
import '@/styles/globals.css'

import { cn } from '@/lib/utils'
import { Metadata } from 'next'
export const metadata: Metadata = {
  title: 'Invoice Renamer',
  description:
    'Invoice Renamer'
}

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning>
      <body
        className={cn(
          'bg-background min-h-screen font-sans antialiased',
        )}>
        {children}
      </body>
    </html>
  )
}
