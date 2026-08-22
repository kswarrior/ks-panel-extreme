import client from '@/shared/api/client';

// Self-service registration responses. `verify` tells the SPA whether to
// jump to the verify-email page (true only when verify_required is on).
export interface RegisterResponse {
  username: string;
  email: string;
  verify: boolean;
}

export async function register(payload: {
  username: string;
  email: string;
  password: string;
}): Promise<RegisterResponse> {
  const res = await client.post<RegisterResponse>('/api/auth/register', payload);
  return res.data;
}

// Send (or resend) the email verification code. The endpoint deliberately
// returns the same reply whether or not the email exists so it can't be used
// for account enumeration.
export interface SendVerifyResponse {
  sent: boolean;
  error?: string;
}

export async function sendVerifyCode(email: string): Promise<SendVerifyResponse> {
  const res = await client.post<SendVerifyResponse>('/api/auth/send-verify', { email });
  return res.data;
}

// Submit the code from the email. On success the SPA redirects to login.
export async function verifyEmail(email: string, code: string): Promise<void> {
  await client.post('/api/auth/verify-email', { email, code });
}
