import { clerkMiddleware } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

export default clerkMiddleware((_auth, request) => {
  const response = NextResponse.next()
  const origin = request.headers.get('origin')
  const allowedOrigins = new Set<string>([
    process.env.ELECTRON_HOST,
    process.env.NEXT_PUBLIC_DESKTOP_ORIGIN,
    'null',
  ].filter((origin): origin is string => Boolean(origin)))

  if (origin && allowedOrigins.has(origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin)
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
    response.headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, Range')
    response.headers.set('Access-Control-Expose-Headers', 'Accept-Ranges, Content-Range, Content-Length')
    response.headers.set('Access-Control-Max-Age', '600')
    response.headers.append('Vary', 'Origin')
    if (request.method === 'OPTIONS') return new NextResponse(null, { status: 204, headers: response.headers })
  }
  return response
})

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
