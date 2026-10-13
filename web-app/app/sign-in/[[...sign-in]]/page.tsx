import { ClerkAuthPage } from '@/components/clerk-auth-page'

export default function SignInPage() {
  return <div className="page-shell auth-shell"><ClerkAuthPage mode="sign-in" /></div>
}
