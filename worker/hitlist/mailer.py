"""Sends the app's emails through Gmail (app password)."""

from __future__ import annotations

import html
import smtplib
from email.message import EmailMessage
from email.utils import formataddr
from typing import Iterable


class Mailer:
    def __init__(self, address: str, app_password: str, sender_name: str = "PFE Hitlist",
                 host: str = "smtp.gmail.com", port: int = 465) -> None:
        self.address, self.password, self.name = address, app_password, sender_name
        self.host, self.port = host, port
        self.sent: list[EmailMessage] = []   # kept for tests / logging

    def send(self, to: Iterable[str], subject: str, body_html: str, dry_run: bool = False,
             text: str | None = None) -> None:
        """`text` is the plain version (Outlook shows it for mail in Junk); made from the HTML if not given."""
        # Never mail the sending Gmail account itself: Rick only wants mail at his work address.
        sender = (self.address or "").strip().lower()
        recipients = sorted({t.strip() for t in to if t and t.strip() and t.strip().lower() != sender})
        if not recipients:
            return
        msg = EmailMessage()
        msg["From"] = formataddr((self.name, self.address))
        msg["To"] = ", ".join(recipients)
        msg["Subject"] = subject
        msg.set_content((text or _to_text(body_html)) + "\n\n-- \nPFE Hitlist, Precision Flow Engineering. Automated message, please don't reply.\n")
        msg.add_alternative(_wrap(body_html), subtype="html")
        self.sent.append(msg)
        if dry_run or not self.password:
            return
        with smtplib.SMTP_SSL(self.host, self.port, timeout=30) as smtp:
            smtp.login(self.address, self.password)
            smtp.send_message(msg)


BRAND, GREEN, INK, MUTED = "#1f4e79", "#5fd08a", "#1c2430", "#6b7684"
FONT = "Arial,Helvetica,sans-serif"


def _wrap(inner: str) -> str:
    """Branded layout: navy HITLIST bar, white card, small footer. Tables and inline styles for Outlook."""
    return (
        f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f5f8">'
        f'<tr><td align="center" style="padding:24px 12px">'
        f'<table role="presentation" width="640" cellpadding="0" cellspacing="0" '
        f'style="width:100%;max-width:640px;background:#ffffff;border:1px solid #e3e6eb">'
        f'<tr><td style="background:{BRAND};padding:14px 24px;font-family:{FONT};font-size:20px;font-weight:900;'
        f'letter-spacing:3px;color:#ffffff">HIT<span style="color:{GREEN}">LIST</span></td></tr>'
        f'<tr><td style="padding:22px 24px;font-family:{FONT};font-size:15px;line-height:1.5;color:{INK}">{inner}</td></tr>'
        f'<tr><td style="padding:12px 24px;border-top:1px solid #eef0f3;font-family:{FONT};font-size:12px;color:{MUTED}">'
        f'PFE Hitlist &middot; Precision Flow Engineering &middot; Automated message, please don&#39;t reply.</td></tr>'
        f'</table></td></tr></table>')


def button(url: str, label: str) -> str:
    return (f'<a href="{esc(url)}" style="display:inline-block;background:{BRAND};color:#ffffff;padding:10px 18px;'
            f'font-family:{FONT};font-size:15px;font-weight:bold;text-decoration:none;border-radius:6px">{esc(label)}</a>')


def _to_text(markup: str) -> str:
    import re
    text = re.sub(r"<br\s*/?>|</p>|</tr>|</h\d>", "\n", markup)
    text = re.sub(r"<[^>]+>", " ", text)
    return html.unescape(re.sub(r"[ \t]+", " ", text)).strip()


def esc(value: object) -> str:
    return html.escape(str(value if value is not None else ""))
