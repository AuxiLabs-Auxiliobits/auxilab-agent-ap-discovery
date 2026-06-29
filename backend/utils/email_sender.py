import os
import smtplib
from email.message import EmailMessage

SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", 587))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASS = os.getenv("SMTP_PASS", "")

def send_otp_email(to_email: str, otp: str):
    """Sends a 6-digit OTP email securely via SMTP."""
    if not SMTP_USER or not SMTP_PASS:
        print(f"Warning: SMTP credentials not set. Would have sent OTP {otp} to {to_email}")
        return False
        
    msg = EmailMessage()
    msg.set_content(f"Your password reset OTP is: {otp}\n\nThis OTP is valid for 5 minutes. If you did not request this, please ignore this email.")
    msg['Subject'] = "Password Reset OTP"
    msg['From'] = SMTP_USER
    msg['To'] = to_email

    try:
        server = smtplib.SMTP(SMTP_HOST, SMTP_PORT)
        server.starttls()
        server.login(SMTP_USER, SMTP_PASS)
        server.send_message(msg)
        server.quit()
        return True
    except Exception as e:
        print(f"Failed to send email: {e}")
        return False
