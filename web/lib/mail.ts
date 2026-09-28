import "server-only";
import nodemailer from "nodemailer";

const BRAND = "#1f4e79", GREEN = "#5fd08a", INK = "#1c2430", MUTED = "#6b7684";
const FONT = "Arial,Helvetica,sans-serif";

/** Branded layout: navy HITLIST bar, white card, small footer. Tables and inline styles so Outlook shows it right. */
export function wrapEmail(inner: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f5f8">` +
    `<tr><td align="center" style="padding:24px 12px">` +
    `<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="width:100%;max-width:640px;background:#ffffff;border:1px solid #e3e6eb">` +
    `<tr><td style="background:${BRAND};padding:14px 24px;font-family:${FONT};font-size:20px;font-weight:900;letter-spacing:3px;color:#ffffff">HIT<span style="color:${GREEN}">LIST</span></td></tr>` +
    `<tr><td style="padding:22px 24px;font-family:${FONT};font-size:15px;line-height:1.5;color:${INK}">${inner}</td></tr>` +
    `<tr><td style="padding:12px 24px;border-top:1px solid #eef0f3;font-family:${FONT};font-size:12px;color:${MUTED}">` +
    `PFE Hitlist &middot; Precision Flow Engineering &middot; Automated message, please don&#39;t reply.</td></tr>` +
    `</table></td></tr></table>`;
}

export function emailButton(url: string, label: string): string {
  return `<a href="${url}" style="display:inline-block;background:${BRAND};color:#ffffff;padding:10px 18px;font-family:${FONT};` +
    `font-size:15px;font-weight:bold;text-decoration:none;border-radius:6px">${label}</a>`;
}

/** Plain version from the HTML (Outlook shows this for mail it has put in Junk). */
function toText(html: string): string {
  return html
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([^<]*)<\/a>/g, (_, url, label) => (label.trim() && !label.includes(url.replace(/^https?:\/\//, "")) ? `${label}: ${url}` : url))
    .replace(/<li[^>]*>/g, "\n - ").replace(/<br\s*\/?>|<\/p>|<\/tr>|<\/ol>|<\/ul>/g, "\n")
    .replace(/<[^>]+>/g, "").replace(/&middot;/g, "·").replace(/&#39;/g, "'").replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ").replace(/\n +/g, "\n").replace(/ ?\n - /g, "\n - ").replace(/\n{3,}/g, "\n\n").trim();
}

export async function sendMail(to: string, subject: string, html: string) {
  const user = process.env.GMAIL_ADDRESS;
  const pass = (process.env.GMAIL_APP_PASSWORD || "").replace(/\s/g, "");
  if (!user || !pass) throw new Error("GMAIL_ADDRESS / GMAIL_APP_PASSWORD are not set");
  const t = nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user, pass } });
  await t.sendMail({
    from: { name: "PFE Hitlist", address: user }, to, subject,
    html: wrapEmail(html),
    text: toText(html) + "\n\n-- \nPFE Hitlist, Precision Flow Engineering. Automated message, please don't reply.",
  });
}
