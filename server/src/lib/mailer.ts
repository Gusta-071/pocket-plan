import nodemailer from 'nodemailer';

export type Mail = { to: string; subject: string; text: string };

/**
 * Envia e-mails pelo SMTP configurado no ambiente (RN-09e).
 * Sem SMTP_HOST (desenvolvimento), mostra o e-mail no console do servidor.
 */
export async function sendMail(mail: Mail): Promise<void> {
  const host = process.env.SMTP_HOST;
  if (!host) {
    console.log(`\n[e-mail] Para: ${mail.to}\n[e-mail] Assunto: ${mail.subject}\n${mail.text}\n`);
    return;
  }
  const transport = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  await transport.sendMail({ from: process.env.SMTP_FROM ?? 'Pocket Plan <no-reply@pocket-plan.local>', ...mail });
}
