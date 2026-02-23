import pyotp


def _register(client, username: str = "owner", password: str = "secret123"):
    response = client.post("/users/register", json={"username": username, "password": password})
    assert response.status_code == 200
    return response.json()


def _login(client, username: str = "owner", password: str = "secret123"):
    response = client.post("/token", data={"username": username, "password": password})
    assert response.status_code == 200
    return response.json()["access_token"]


def test_auth_login_and_me(client):
    _register(client, "alice", "alice123")
    token = _login(client, "alice", "alice123")

    me = client.get("/users/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["username"] == "alice"


def test_creator_crud_status_and_filter(client):
    user = _register(client, "bob", "bob12345")
    token = _login(client, "bob", "bob12345")

    payload = [
        {"platform": "TikTok", "unique_id": "bob_a", "data": {"email": "a@example.com", "nickname": "A"}},
        {"platform": "TikTok", "unique_id": "bob_b", "data": {"nickname": "B"}},
    ]
    push = client.post(
        "/creators/push",
        json=payload,
        headers={"X-API-Key": user["api_key"]},
    )
    assert push.status_code == 200
    assert len(push.json()) == 2

    listed = client.get(
        "/creators/",
        params={"has_email": True, "platform": "TikTok"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert listed.status_code == 200
    listed_body = listed.json()
    assert listed_body["total"] == 1
    creator_id = listed_body["items"][0]["id"]

    patched = client.patch(
        f"/creators/{creator_id}/status",
        json={"status": "pending"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert patched.status_code == 200
    assert patched.json()["manual_status"] == "pending"

    deleted = client.delete(
        f"/creators/{creator_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert deleted.status_code == 200


def test_creator_dedup_is_owner_scoped(client):
    user_a = _register(client, "owner_a", "owner_a123")
    user_b = _register(client, "owner_b", "owner_b123")

    payload = [
        {"platform": "TikTok", "unique_id": "same_handle", "data": {"nickname": "A"}},
    ]

    push_a = client.post("/creators/push", json=payload, headers={"X-API-Key": user_a["api_key"]})
    assert push_a.status_code == 200
    assert len(push_a.json()) == 1

    push_b = client.post("/creators/push", json=payload, headers={"X-API-Key": user_b["api_key"]})
    assert push_b.status_code == 200
    assert len(push_b.json()) == 1

    token_a = _login(client, "owner_a", "owner_a123")
    token_b = _login(client, "owner_b", "owner_b123")

    list_a = client.get("/creators/", headers={"Authorization": f"Bearer {token_a}"})
    list_b = client.get("/creators/", headers={"Authorization": f"Bearer {token_b}"})

    assert list_a.status_code == 200
    assert list_b.status_code == 200
    assert list_a.json()["total"] == 1
    assert list_b.json()["total"] == 1
    assert list_a.json()["items"][0]["owner_id"] != list_b.json()["items"][0]["owner_id"]


def test_email_send_rejects_unowned_creator_ids(client):
    user_a = _register(client, "mail_owner_a", "mail_owner_a123")
    user_b = _register(client, "mail_owner_b", "mail_owner_b123")

    token_a = _login(client, "mail_owner_a", "mail_owner_a123")

    smtp_resp = client.post(
        "/emails/smtp",
        json={
            "host": "smtp.example.com",
            "port": 587,
            "username": "a@example.com",
            "password": "pw",
            "is_default": True,
        },
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert smtp_resp.status_code == 200

    push_a = client.post(
        "/creators/push",
        json=[{"platform": "TikTok", "unique_id": "mail_a", "data": {"email": "a_target@example.com"}}],
        headers={"X-API-Key": user_a["api_key"]},
    )
    assert push_a.status_code == 200
    creator_a_id = push_a.json()[0]["id"]

    push_b = client.post(
        "/creators/push",
        json=[{"platform": "TikTok", "unique_id": "mail_b", "data": {"email": "b_target@example.com"}}],
        headers={"X-API-Key": user_b["api_key"]},
    )
    assert push_b.status_code == 200
    creator_b_id = push_b.json()[0]["id"]

    blocked = client.post(
        "/emails/send",
        json={
            "creator_ids": [creator_a_id, creator_b_id],
            "subject": "hello",
            "body": "world",
        },
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert blocked.status_code == 403


def test_password_update_requires_current_password(client):
    _register(client, "pwd_user", "old_password")
    token = _login(client, "pwd_user", "old_password")

    wrong_current = client.put(
        "/users/me/password",
        json={"current_password": "not_old", "new_password": "new_password"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert wrong_current.status_code == 403

    updated = client.put(
        "/users/me/password",
        json={"current_password": "old_password", "new_password": "new_password"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert updated.status_code == 200

    old_login = client.post("/token", data={"username": "pwd_user", "password": "old_password"})
    assert old_login.status_code == 401

    new_login = client.post("/token", data={"username": "pwd_user", "password": "new_password"})
    assert new_login.status_code == 200


def test_update_profile_rejects_duplicate_username(client):
    _register(client, "name_owner_a", "secret123")
    _register(client, "name_owner_b", "secret123")
    token_b = _login(client, "name_owner_b", "secret123")

    resp = client.put(
        "/users/me",
        json={"username": "name_owner_a"},
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert resp.status_code == 409
    assert resp.json()["detail"] == "Username already exists"


def test_2fa_enable_and_login_requires_otp(client):
    _register(client, "otp_user", "otp_pass_123")
    token = _login(client, "otp_user", "otp_pass_123")

    setup = client.post(
        "/users/me/2fa/setup",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert setup.status_code == 200
    secret = setup.json()["secret"]

    enable = client.post(
        "/users/me/2fa/enable",
        json={"code": pyotp.TOTP(secret).now()},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert enable.status_code == 200
    assert enable.json()["two_fa_enabled"] is True

    no_otp_login = client.post("/token", data={"username": "otp_user", "password": "otp_pass_123"})
    assert no_otp_login.status_code == 401
    assert no_otp_login.json()["detail"] == "2FA_REQUIRED"

    otp_login = client.post(
        "/token",
        data={
            "username": "otp_user",
            "password": "otp_pass_123",
            "otp_code": pyotp.TOTP(secret).now(),
        },
    )
    assert otp_login.status_code == 200
    assert "access_token" in otp_login.json()
