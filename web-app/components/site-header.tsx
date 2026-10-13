'use client'

import Link from 'next/link'
import { SignedIn, SignedOut, SignInButton, SignUpButton, UserButton } from '@clerk/nextjs'

export function SiteHeader() {
  return (
    <header className="site-header">
      <Link className="brand" href="/" aria-label="ClipSphere home">
        <span className="brand-mark">C</span>
        <span>ClipSphere</span>
      </Link>
      <nav className="header-actions" aria-label="Account">
        <SignedOut>
          <SignInButton><button className="button button-quiet" type="button">Sign in</button></SignInButton>
          <SignUpButton><button className="button button-primary" type="button">Get started</button></SignUpButton>
        </SignedOut>
        <SignedIn>
          <Link className="button button-quiet" href="/">My workspaces</Link>
          <UserButton />
        </SignedIn>
      </nav>
    </header>
  )
}
