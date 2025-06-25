import React from 'react'
import '@/styles/globals.css'

import { cn } from '@/lib/utils'
import { Metadata } from 'next'
import { Toaster } from "@/components/ui/sonner"
import { sfProRounded } from './fonts';

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
      <body className={`${sfProRounded.className} bg-background min-h-screen font-sans `}>
        {children}
        <Toaster/>
      </body>
    </html>
  )
}
