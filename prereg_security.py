"""Small, independently testable primitives for invitation authentication."""
import hashlib
import hmac
import secrets


def new_token():
    return secrets.token_urlsafe(32)


def new_code():
    return '%06d' % secrets.randbelow(1000000)


def code_digest(token, code):
    return hmac.new(token.encode(), str(code).encode(), hashlib.sha256).hexdigest()


def code_matches(token, code, digest):
    return bool(digest and len(str(code)) == 6 and str(code).isascii()
                and str(code).isdigit()
                and hmac.compare_digest(code_digest(token, code), digest))
