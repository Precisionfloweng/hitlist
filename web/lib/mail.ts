import "server-only";
import nodemailer from "nodemailer";

export async function sendMail(to: string, subject: string, html: string) {
  const user = process.env.GMAIL_ADDRESS;
  const pass = (process.env.GMAIL_APP_PASSWORD || "").replace(/\s/g, "");
  if (!user || !pass) throw new Error("GMAIL_ADDRESS / GMAIL_APP_PASSWORD are not set");
  const t = nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user, pass } });
  await t.sendMail({
    from: { name: "PFE Hitlist", address: user }, to, subject,
    html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222">${html}` +
      `<p style="color:#888;font-size:12px">Automated message from PFE Hitlist. Please do not reply.</p></div>`,
  });
}
