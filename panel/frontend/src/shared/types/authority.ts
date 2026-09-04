export type AuthorityRegistrationMode = 'any' | 'n' | 'all';

export interface AuthorityProvider {
  id: string;
  enabled: boolean;
  client_id?: string;
  client_secret?: string;
  scopes?: string;
  redirect_uri?: string;
}

export interface AuthorityOTPOptions {
  email_enabled: boolean;
  phone_enabled: boolean;
  magic_link_email: boolean;
  code_length: number;
  ttl_seconds: number;
  sms_gateway?: string;
  sms_account_sid?: string;
  sms_api_token?: string;
  sms_from_number?: string;
}

export interface AuthorityAppConnection {
  enabled: boolean;
  secret?: string;
  issuer?: string;
  pin_size: number;
  rotation_seconds: number;
  digits_in_window: number;
}

export interface AuthorityConfig {
  smtp_host?: string;
  smtp_port?: string;
  smtp_user?: string;
  smtp_password?: string;
  smtp_from?: string;
  smtp_tls?: string;
  register_allow?: string;
  register_role?: string;
  device_account_limit?: string;
  verify_required?: string;
  providers?: AuthorityProvider[];
  registration_mode?: AuthorityRegistrationMode;
  registration_minimum_n?: number;
  registration_allowed_providers?: string[];
  otp?: AuthorityOTPOptions;
  app_connect?: AuthorityAppConnection;
}

export const AUTHORITY_SECRET_KEEP = '*';

export type UserAuthorityMode = 'any' | 'n' | 'all';

export interface UserAuthorityConfig {
  enabled_authorities: string[];
  required_mode: UserAuthorityMode;
  required_n: number;
}

export interface AuthProviderInfo {
  id: string;
  label: string;
  kind: 'oauth' | 'channel';
}

export interface MeAuthResponse {
  available: AuthProviderInfo[];
  cfg: UserAuthorityConfig;
  role_allowed?: string[];
  unrestricted: boolean;
}

export const AUTHORITY_PROVIDER = {
  google: 'google',
  microsoft: 'microsoft',
  apple: 'apple',
  discord: 'discord',
  github: 'github',
  email: 'email',
  phone: 'phone',
  totp: 'totp',
  password: 'password',
} as const;

export type AuthorityProviderId = (typeof AUTHORITY_PROVIDER)[keyof typeof AUTHORITY_PROVIDER];