'use client'

import { SignIn, SignUp } from '@clerk/nextjs'

export function ClerkAuthPage({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  return <div className="auth-page"><div className="auth-copy"><span className="eyebrow">YOUR IDEAS, IN GOOD COMPANY</span><h1>{mode === 'sign-in' ? 'Welcome back.' : 'Make room for good ideas.'}</h1><p>Sign in to return to your workspaces, or create an account to start sharing.</p></div><div className="auth-widget">{mode === 'sign-in' ? <SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" /> : <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" />}</div></div>
}
