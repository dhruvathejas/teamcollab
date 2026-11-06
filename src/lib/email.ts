import "server-only";
import { Resend } from "resend";

type Email = { to: string; subject: string; text: string; html: string };

function transport(): "resend" | "console" {
  const configured = process.env.EMAIL_TRANSPORT?.trim();
  if (configured === "console" || configured === "resend") return configured;
  return process.env.RESEND_API_KEY ? "resend" : "console";
}

let client: Resend | null = null;
const SEND_TIMEOUT_MS = 10_000;

/**
 * Send an email through Resend. When no API key is configured (or
 * EMAIL_TRANSPORT=console) the email is printed to the server log instead,
 * which is meant for local development and tests only.
 */
export async function sendEmail(email: Email): Promise<void> {
  if (transport() === "console") {
    if (process.env.NODE_ENV === "production" && process.env.EMAIL_TRANSPORT !== "console") {
      throw new Error("RESEND_API_KEY is not set; cannot send email.");
    }
    console.info(`[email] to=${email.to} subject="${email.subject}"\n${email.text}`);
    return;
  }

  const from = process.env.EMAIL_FROM;
  if (!from) throw new Error("EMAIL_FROM is not set.");
  client ??= new Resend(process.env.RESEND_API_KEY);
  // The SDK has no timeout of its own; give up well within the 30 s resend cooldown.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Resend did not respond within 10 s")), SEND_TIMEOUT_MS);
  });
  try {
    const { error } = await Promise.race([client.emails.send({ from, ...email }), timeout]);
    if (error) throw new Error(`Resend failed to send email: ${error.message}`);
  } finally {
    clearTimeout(timer);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function codeEmail(opts: { to: string; code: string; purpose: "login" | "signup"; username: string }): Email {
  const action = opts.purpose === "signup" ? "finish creating your account" : "log in";
  const subject = `${opts.code} is your teamcollab code`;
  const text = [
    `Hi @${opts.username},`,
    "",
    `Use this code to ${action} on teamcollab:`,
    "",
    `    ${opts.code}`,
    "",
    "It expires in 10 minutes. If you didn't try to sign in, you can ignore this",
    "email — but someone may know your password, so consider changing it.",
  ].join("\n");
  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f7f7f8;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#18181b">
  <div style="max-width:420px;margin:0 auto;background:#fff;border:1px solid #e2e2e8;border-radius:12px;padding:28px">
    <p style="margin:0 0 16px;font-weight:600">teamcollab</p>
    <p style="margin:0 0 8px">Hi @${escapeHtml(opts.username)},</p>
    <p style="margin:0 0 20px">Use this code to ${action}:</p>
    <p style="margin:0 0 20px;font-size:32px;font-weight:700;letter-spacing:8px;font-family:ui-monospace,Menlo,monospace">${opts.code}</p>
    <p style="margin:0;color:#62626d;font-size:13px">It expires in 10 minutes. If you didn't try to sign in, you can ignore this email, but someone may know your password, so consider changing it.</p>
  </div>
</body></html>`;
  return { to: opts.to, subject, text, html };
}
