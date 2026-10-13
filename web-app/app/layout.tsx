import type { Metadata } from 'next'
import { ClerkProvider } from '@clerk/nextjs'
import { SiteHeader } from '@/components/site-header'
import './globals.css'

export const metadata: Metadata = {
  title: { default: 'ClipSphere', template: '%s · ClipSphere' },
  description: 'Record, organize, and share video with your team.',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <ClerkProvider>
          <SiteHeader />
          <main>{children}</main>
        </ClerkProvider>
      </body>
    </html>
  )
}
