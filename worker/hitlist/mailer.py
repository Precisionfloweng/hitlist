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

    def send(self, to: Iterable[str], subject: str, body_html: str, dry_run: bool = False) -> None:
        recipients = sorted({t.strip() for t in to if t and t.strip()})
        if not recipients:
            return
        msg = EmailMessage()
        msg["From"] = formataddr((self.name, self.address))
        msg["To"] = ", ".join(recipients)
        msg["Subject"] = subject
        msg.set_content(_to_text(body_html))
        msg.add_alternative(_wrap(body_html), subtype="html")
        self.sent.append(msg)
        if dry_run or not self.password:
            return
        with smtplib.SMTP_SSL(self.host, self.port, timeout=30) as smtp:
            smtp.login(self.address, self.password)
            smtp.send_message(msg)


def _wrap(inner: str) -> str:
    return ("<div style=\"font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222\">"
            f"{inner}<p style=\"color:#888;font-size:12px\">Automated message from PFE Hitlist. "
            "Please do not reply.</p></div>")


def _to_text(markup: str) -> str:
    import re
    text = re.sub(r"<br\s*/?>|</p>|</tr>|</h\d>", "\n", markup)
    text = re.sub(r"<[^>]+>", " ", text)
    return html.unescape(re.sub(r"[ \t]+", " ", text)).strip()


def esc(value: object) -> str:
    return html.escape(str(value if value is not None else ""))
