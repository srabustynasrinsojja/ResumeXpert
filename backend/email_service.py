"""Outbound transactional email — used for real-email ownership verification.

Reads SMTP credentials from environment variables. Designed for Gmail SMTP with
an App Password (see README setup notes), but works with any standard SMTP
provider (SendGrid, Mailgun, Resend's SMTP endpoint, etc.) since it only uses
smtplib against host/port/user/password.

If SMTP_USER / SMTP_APP_PASSWORD are not configured, sending is skipped and the
verification link is logged instead — this keeps local development unblocked
without real credentials, while production (with env vars set) sends for real.
"""

from __future__ import annotations

import logging
import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

logger = logging.getLogger("email_service")

SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_APP_PASSWORD = os.getenv("SMTP_APP_PASSWORD", "")
MAIL_FROM_NAME = os.getenv("MAIL_FROM_NAME", "ResumeXpert")


def _smtp_configured() -> bool:
    return bool(SMTP_USER and SMTP_APP_PASSWORD)


def _send(to_email: str, subject: str, html_body: str, text_body: str) -> bool:
    if not _smtp_configured():
        logger.warning(
            "SMTP not configured (SMTP_USER/SMTP_APP_PASSWORD missing) — "
            "email NOT sent. Link/body follows for local testing:\n%s",
            text_body,
        )
        return False

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"{MAIL_FROM_NAME} <{SMTP_USER}>"
    msg["To"] = to_email
    msg.attach(MIMEText(text_body, "plain"))
    msg.attach(MIMEText(html_body, "html"))

    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=15) as server:
            server.starttls()
            server.login(SMTP_USER, SMTP_APP_PASSWORD)
            server.sendmail(SMTP_USER, [to_email], msg.as_string())
        return True
    except Exception:
        logger.exception("Failed to send email to %s", to_email)
        return False


def send_otp_email(to_email: str, full_name: str, otp: str) -> bool:
    greeting = f"Hi {full_name.strip()}," if full_name.strip() else "Hi,"
    spaced_otp = f"{otp[:3]} {otp[3:]}"

    text_body = (
        f"{greeting}\n\n"
        f"Your ResumeXpert verification code is:\n\n"
        f"    {otp}\n\n"
        f"Enter this code in the app to finish creating your account. It expires "
        f"in 10 minutes. If you didn't request this, you can safely ignore this email.\n\n"
        f"— {MAIL_FROM_NAME}"
    )

    html_body = f"""
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:440px;margin:0 auto;padding:32px 28px;background:#faf7ef;border-radius:14px;border:1px solid #e7ddc4;">
      <p style="font-size:15px;color:#2a2013;">{greeting}</p>
      <p style="font-size:14px;color:#4a3d24;line-height:1.6;">
        Use this code to finish creating your <b>ResumeXpert</b> account and confirm
        this is really your inbox:
      </p>
      <p style="text-align:center;margin:28px 0;">
        <span style="display:inline-block;padding:16px 28px;border-radius:12px;
                     background:linear-gradient(135deg,#c9a84c,#deba52);color:#1a1208;
                     font-weight:bold;font-size:28px;letter-spacing:.18em;font-family:monospace;">
          {spaced_otp}
        </span>
      </p>
      <p style="font-size:11.5px;color:#a89870;text-align:center;">
        This code expires in 10 minutes. If you didn't request this, you can
        safely ignore this email.
      </p>
    </div>
    """

    return _send(to_email, f"Your ResumeXpert verification code: {otp}", html_body, text_body)
