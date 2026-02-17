import nodemailer from 'nodemailer';

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return null;
  }

  transporter = nodemailer.createTransport({
    host,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: parseInt(process.env.SMTP_PORT || '587', 10) === 465,
    auth: { user, pass }
  });

  return transporter;
}

export async function sendEmail(to, subject, body) {
  const t = getTransporter();
  if (!t) {
    return { error: 'Email not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASS environment variables.' };
  }

  const from = process.env.SMTP_FROM || process.env.SMTP_USER;

  try {
    const info = await t.sendMail({ from, to, subject, text: body });
    return {
      success: true,
      message: `Email sent to ${to}`,
      messageId: info.messageId
    };
  } catch (error) {
    console.error('[Email] Send error:', error.message);
    return { error: `Failed to send email: ${error.message}` };
  }
}
