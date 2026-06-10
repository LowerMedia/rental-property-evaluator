/**
 * E11 — transactional email (RPE-95)
 *
 * A deliberately small Mailer interface so the provider is swappable and
 * mockable. Two implementations:
 *
 *   - ResendMailer — HTTP API via fetch, zero SDK dependency. Configure
 *     with RPE_MAIL_PROVIDER=resend, RESEND_API_KEY, RPE_MAIL_FROM
 *     ("Deals <noreply@yourdomain>" — the domain must be verified in
 *     Resend for deliverability; see docs note).
 *   - SandboxMailer — captures sends in memory; the default whenever no
 *     provider is configured, so CI/local NEVER send real email.
 *
 * Templates (verification / password reset / org invite) are plain
 * text + minimal HTML with explicit link-expiry messaging.
 */

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

// ─── Sandbox ──────────────────────────────────────────────────────────────────

/** In-memory capture — the CI/local default and the harness assertion point. */
export class SandboxMailer implements Mailer {
  readonly sent: MailMessage[] = [];

  async send(message: MailMessage): Promise<void> {
    this.sent.push(message);
  }
}

// ─── Resend (HTTP, no SDK) ────────────────────────────────────────────────────

const RESEND_TIMEOUT_MS = 10_000;

export class ResendMailer implements Mailer {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(message: MailMessage): Promise<void> {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html,
      }),
      signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
    });
    if (!res.ok) {
      // Never log recipient addresses alongside failures beyond what's
      // needed to debug — status only
      throw new Error(`Resend send failed: HTTP ${res.status}`);
    }
  }
}

/** Env-driven construction: Resend when configured, sandbox otherwise. */
export function createMailerFromEnv(): Mailer {
  const provider = (process.env['RPE_MAIL_PROVIDER'] ?? '').toLowerCase();
  if (provider === 'resend') {
    const apiKey = process.env['RESEND_API_KEY'] ?? '';
    const from = process.env['RPE_MAIL_FROM'] ?? '';
    if (apiKey === '' || from === '') {
      throw new Error('RPE_MAIL_PROVIDER=resend requires RESEND_API_KEY and RPE_MAIL_FROM');
    }
    return new ResendMailer(apiKey, from);
  }
  return new SandboxMailer();
}

// ─── Templates ────────────────────────────────────────────────────────────────

const APP_NAME = 'Rental Property Evaluator';

function htmlShell(title: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="font-family:system-ui,sans-serif;max-width:540px;margin:0 auto;padding:24px;color:#111">
<h2 style="font-weight:600">${title}</h2>
${bodyHtml}
<p style="color:#888;font-size:12px;margin-top:32px">${APP_NAME} — if you didn't request this, you can safely ignore this email.</p>
</body></html>`;
}

export function verificationEmail(to: string, verifyUrl: string): MailMessage {
  return {
    to,
    subject: `Verify your email — ${APP_NAME}`,
    text: `Confirm your email address by opening this link (valid for 1 hour):\n\n${verifyUrl}\n\nIf you didn't create an account, ignore this email.`,
    html: htmlShell(
      'Verify your email',
      `<p>Confirm your email address by clicking the link below. The link is valid for <strong>1 hour</strong>.</p>
<p><a href="${verifyUrl}">Verify email address</a></p>`,
    ),
  };
}

export function passwordResetEmail(to: string, resetUrl: string): MailMessage {
  return {
    to,
    subject: `Reset your password — ${APP_NAME}`,
    text: `Reset your password by opening this link (valid for 1 hour, single use):\n\n${resetUrl}\n\nIf you didn't request a reset, ignore this email — your password is unchanged.`,
    html: htmlShell(
      'Reset your password',
      `<p>Reset your password by clicking the link below. The link is valid for <strong>1 hour</strong> and can be used once.</p>
<p><a href="${resetUrl}">Reset password</a></p>`,
    ),
  };
}

export function orgInviteEmail(to: string, orgName: string, acceptUrl: string): MailMessage {
  return {
    to,
    subject: `You're invited to ${orgName} — ${APP_NAME}`,
    text: `You've been invited to join ${orgName}. Accept the invitation here (valid for 48 hours):\n\n${acceptUrl}`,
    html: htmlShell(
      `Join ${orgName}`,
      `<p>You've been invited to join <strong>${orgName}</strong>. The invitation is valid for <strong>48 hours</strong>.</p>
<p><a href="${acceptUrl}">Accept invitation</a></p>`,
    ),
  };
}
