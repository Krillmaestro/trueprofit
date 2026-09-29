import { NextResponse } from 'next/server'

// The old public setup secret could overwrite any user's password.
// Recovery must use a separately verified, expiring recovery flow.
export async function POST() {
  return NextResponse.json({ error: 'Password setup is disabled. Sign in with your existing login method.' }, { status: 410 })
}
