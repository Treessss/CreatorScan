import base64
import hashlib
import hmac
import os
import struct
import time
import urllib.parse


def random_base32(length: int = 32) -> str:
    raw = os.urandom(length)
    return base64.b32encode(raw).decode("ascii").rstrip("=")


class TOTP:
    def __init__(self, secret: str, interval: int = 30, digits: int = 6):
        self.secret = secret
        self.interval = interval
        self.digits = digits

    def _counter(self, for_time: int | None = None) -> int:
        ts = int(time.time()) if for_time is None else int(for_time)
        return ts // self.interval

    def _code_at(self, counter: int) -> str:
        pad = "=" * ((8 - len(self.secret) % 8) % 8)
        key = base64.b32decode((self.secret + pad).upper().encode("ascii"))
        msg = struct.pack(">Q", counter)
        digest = hmac.new(key, msg, hashlib.sha1).digest()
        offset = digest[-1] & 0x0F
        binary = struct.unpack(">I", digest[offset:offset + 4])[0] & 0x7FFFFFFF
        otp = binary % (10 ** self.digits)
        return str(otp).zfill(self.digits)

    def now(self) -> str:
        return self._code_at(self._counter())

    def verify(self, code: str, valid_window: int = 0) -> bool:
        if code is None:
            return False
        code = str(code).strip()
        counter = self._counter()
        for delta in range(-valid_window, valid_window + 1):
            if self._code_at(counter + delta) == code:
                return True
        return False

    def provisioning_uri(self, name: str, issuer_name: str | None = None) -> str:
        label = urllib.parse.quote(name)
        params = {"secret": self.secret}
        if issuer_name:
            params["issuer"] = issuer_name
        query = urllib.parse.urlencode(params)
        return f"otpauth://totp/{label}?{query}"
