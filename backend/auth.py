"""Authentication: JWT tokens, password hashing, FastAPI dependencies."""

from __future__ import annotations

import os
import secrets
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

try:
    from jose import JWTError, jwt
except ImportError:
    from jose import jwt, JWTError  # type: ignore

from . import email_service
from .database import (
    create_pending_user,
    finalize_registration_db,
    get_user_by_email,
    get_user_by_id,
    increment_otp_attempts_db,
    update_pending_registration_db,
)

# ─── Config ──────────────────────────────────────────────────────────

SECRET_KEY = os.getenv("JWT_SECRET_KEY", "dev-secret-change-this-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", "1440"))  # 24 hours default
OTP_EXPIRE_MINUTES = int(os.getenv("OTP_EXPIRE_MINUTES", "10"))
MAX_OTP_ATTEMPTS = 5

security_scheme = HTTPBearer(auto_error=False)

# ─── Password helpers ────────────────────────────────────────────────

def hash_password(password: str) -> str:
    import bcrypt
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    import bcrypt
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


# ─── JWT helpers ─────────────────────────────────────────────────────

def create_access_token(user_id: str, role: str, extra: Optional[Dict[str, Any]] = None) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": user_id,
        "role": role,
        "exp": expire,
        **(extra or {}),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> Dict[str, Any]:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token.",
        )


# ─── Register (OTP flow) / Login ──────────────────────────────────────
#
# Signup is two calls:
#   1) start_registration    — email/name/role only. Sends a 6-digit code.
#      No password yet, no account usable yet.
#   2) complete_registration — email/code/password. Confirms the code,
#      sets the password, marks the account real and logs them straight in.
#
# Nothing with a working password exists until step 2 succeeds, so a
# fake or mistyped email simply never becomes a usable account.

def _generate_otp() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def start_registration(email: str, full_name: str = "", role: str = "candidate") -> Dict[str, Any]:
    email = email.strip().lower()
    if role not in ("candidate", "recruiter"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Role must be 'candidate' or 'recruiter'.")

    existing = get_user_by_email(email)
    if existing and existing.get("email_verified"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists. Please sign in instead.",
        )

    otp = _generate_otp()
    otp_hash = hash_password(otp)
    expires = (datetime.now(timezone.utc) + timedelta(minutes=OTP_EXPIRE_MINUTES)).isoformat()

    if existing:
        # An earlier signup attempt for this email never finished — reuse the
        # slot rather than erroring, so a mistyped code doesn't lock them out.
        update_pending_registration_db(existing["id"], full_name=full_name, role=role, otp_hash=otp_hash, otp_expires=expires)
    else:
        create_pending_user(email=email, full_name=full_name, role=role, otp_hash=otp_hash, otp_expires=expires)

    email_sent = email_service.send_otp_email(email, full_name, otp)
    return {
        "email": email,
        "email_sent": email_sent,
        "message": (
            f"We sent a 6-digit code to {email}. It expires in {OTP_EXPIRE_MINUTES} minutes."
            if email_sent else
            "Account started, but the code email could not be sent. Use 'Resend code' to try again."
        ),
    }


def resend_registration_otp(email: str) -> None:
    """Always behaves the same whether or not the email is mid-signup, so this
    can't be used to probe which emails are registered."""
    email = email.strip().lower()
    user = get_user_by_email(email)
    if user is None or user.get("email_verified", False):
        return
    otp = _generate_otp()
    otp_hash = hash_password(otp)
    expires = (datetime.now(timezone.utc) + timedelta(minutes=OTP_EXPIRE_MINUTES)).isoformat()
    update_pending_registration_db(user["id"], full_name=user.get("full_name", ""), role=user.get("role", "candidate"), otp_hash=otp_hash, otp_expires=expires)
    email_service.send_otp_email(user["email"], user.get("full_name", ""), otp)


def complete_registration(email: str, otp: str, password: str) -> Dict[str, Any]:
    email = email.strip().lower()
    if len(password) < 6:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Password must be at least 6 characters.")

    user = get_user_by_email(email)
    if user is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No pending sign-up found for this email. Start again.")
    if user.get("email_verified"):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This email is already verified. Please sign in instead.")

    expires_raw = user.get("otp_expires")
    expired = True
    if expires_raw:
        try:
            expired = datetime.fromisoformat(expires_raw) < datetime.now(timezone.utc)
        except ValueError:
            expired = True
    if expired:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="That code expired. Request a new one.")

    if user.get("otp_attempts", 0) >= MAX_OTP_ATTEMPTS:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Too many incorrect attempts. Request a new code.")

    if not user.get("otp_hash") or not verify_password(otp, user["otp_hash"]):
        increment_otp_attempts_db(user["id"])
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Incorrect code. Please check and try again.")

    hashed_pw = hash_password(password)
    finalize_registration_db(user["id"], password_hash=hashed_pw)
    user = get_user_by_id(user["id"])

    token = create_access_token(user["id"], user["role"])
    safe_user = {k: v for k, v in user.items() if k not in ("password_hash", "otp_hash")}
    return {"user": safe_user, "access_token": token, "token_type": "bearer"}


def login_user(email: str, password: str) -> Dict[str, Any]:
    user = get_user_by_email(email)
    if user is None or not user.get("password_hash"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password.",
        )
    if not verify_password(password, user["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password.",
        )
    if not user.get("email_verified", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "email_not_verified",
                "message": "Please finish verifying your email — enter the code we sent you.",
                "email": user["email"],
            },
        )
    token = create_access_token(user["id"], user["role"])
    safe_user = {k: v for k, v in user.items() if k != "password_hash"}
    return {"user": safe_user, "access_token": token, "token_type": "bearer"}


# ─── FastAPI dependencies ────────────────────────────────────────────

def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_scheme),
) -> Dict[str, Any]:
    """Require a valid JWT token. Returns the full user dict."""
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Pass 'Authorization: Bearer <token>' header.",
        )
    payload = decode_token(credentials.credentials)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload.")
    user = get_user_by_id(user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found.")
    return user


def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_scheme),
) -> Optional[Dict[str, Any]]:
    """If a token is present and valid, return user. Otherwise return None (no error)."""
    if credentials is None:
        return None
    try:
        payload = decode_token(credentials.credentials)
        user_id = payload.get("sub")
        if user_id:
            return get_user_by_id(user_id)
    except HTTPException:
        pass
    return None


def require_role(required_role: str):
    """Dependency factory: ensures the user has the required role."""
    def _check(user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
        if user.get("role") != required_role and user.get("role") != "admin":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"This endpoint requires '{required_role}' role.",
            )
        return user
    return _check
