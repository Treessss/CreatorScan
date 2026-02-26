from datetime import datetime, timedelta, UTC

import pyotp

from app.domains.creator.models import Creator
from app.domains.email.models import EmailLog
from app.domains.email.service import EmailService


def _register(client, username: str, password: str):
    response = client.post("/users/register", json={"username": username, "password": password})
    assert response.status_code == 200
    return response.json()


def _login(client, username: str, password: str):
    response = client.post("/token", data={"username": username, "password": password})
    assert response.status_code == 200
    return response.json()["access_token"]


def _create_smtp(client, token: str, username: str, is_default: bool = False):
    resp = client.post(
        "/emails/smtp",
        json={
            "host": "smtp.example.com",
            "port": 587,
            "username": username,
            "password": "pw",
            "sender_name": "Sender",
            "is_default": is_default,
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    return resp.json()


def _push_creators(client, api_key: str, rows: list[dict]):
    resp = client.post("/creators/push", json=rows, headers={"X-API-Key": api_key})
    assert resp.status_code == 200
    return resp.json()


def test_email_send_rejects_unowned_smtp_config_ids(client):
    owner_a = _register(client, "smtp_owner_a", "secret123")
    owner_b = _register(client, "smtp_owner_b", "secret123")
    token_a = _login(client, "smtp_owner_a", "secret123")
    token_b = _login(client, "smtp_owner_b", "secret123")

    cfg_a = _create_smtp(client, token_a, "a@example.com", is_default=True)
    cfg_b = _create_smtp(client, token_b, "b@example.com", is_default=True)

    pushed = _push_creators(
        client,
        owner_a["api_key"],
        [{"platform": "TikTok", "unique_id": "smtp_target_1", "data": {"email": "target1@example.com"}}],
    )
    creator_id = pushed[0]["id"]

    blocked = client.post(
        "/emails/send",
        json={
            "creator_ids": [creator_id],
            "subject": "hello",
            "body": "world",
            "smtp_config_ids": [cfg_a["id"], cfg_b["id"]],
        },
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert blocked.status_code == 403
    assert "SMTP configs not owned" in blocked.json()["detail"]


def test_email_send_queues_with_multiple_owned_smtp_configs(client, monkeypatch):
    owner = _register(client, "smtp_queue_user", "secret123")
    token = _login(client, "smtp_queue_user", "secret123")

    cfg_1 = _create_smtp(client, token, "one@example.com", is_default=True)
    cfg_2 = _create_smtp(client, token, "two@example.com")

    pushed = _push_creators(
        client,
        owner["api_key"],
        [
            {"platform": "TikTok", "unique_id": "queue_1", "data": {"email": "q1@example.com"}},
            {"platform": "TikTok", "unique_id": "queue_2", "data": {"email": "q2@example.com"}},
        ],
    )
    creator_ids = [row["id"] for row in pushed]

    captured: dict[str, tuple] = {}

    def fake_task(user_id, creator_ids_arg, subject, body, smtp_config_id=None, smtp_config_ids=None):
        captured["args"] = (user_id, creator_ids_arg, subject, body, smtp_config_id, smtp_config_ids)

    monkeypatch.setattr(EmailService, "send_batch_emails_task", fake_task)

    resp = client.post(
        "/emails/send",
        json={
            "creator_ids": creator_ids,
            "subject": "Multi Sender",
            "body": "Body",
            "smtp_config_ids": [cfg_1["id"], cfg_2["id"]],
        },
        headers={"Authorization": f"Bearer {token}"},
    )

    assert resp.status_code == 200
    assert resp.json()["count"] == 2
    assert captured["args"][0] == owner["id"]
    assert captured["args"][1] == creator_ids
    assert captured["args"][2] == "Multi Sender"
    assert captured["args"][5] == [cfg_1["id"], cfg_2["id"]]


def test_smtp_update_keeps_existing_password_when_blank(client):
    _register(client, "smtp_edit_user", "secret123")
    token = _login(client, "smtp_edit_user", "secret123")

    created = _create_smtp(client, token, "edit@example.com", is_default=True)
    assert created["password"] == "pw"

    updated = client.put(
        f"/emails/smtp/{created['id']}",
        json={
            "sender_name": "Renamed Sender",
            "password": "",
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert updated.status_code == 200
    body = updated.json()
    assert body["sender_name"] == "Renamed Sender"
    assert body["password"] == "pw"


def test_email_logs_filters_and_pagination(client, db_session):
    user = _register(client, "log_filter_user", "secret123")
    token = _login(client, "log_filter_user", "secret123")

    creator = Creator(
        platform="TikTok",
        unique_id="filter_target",
        data={"email": "filter@example.com"},
        owner_id=user["id"],
    )
    db_session.add(creator)
    db_session.commit()
    db_session.refresh(creator)

    now = datetime.now(UTC).replace(tzinfo=None)
    logs = [
        EmailLog(
            sender_id=user["id"],
            recipient_id=creator.id,
            recipient_email="filter@example.com",
            recipient_name="One",
            subject="old-sent",
            body="b1",
            status="sent",
            replied=False,
            sent_at=now - timedelta(minutes=2),
        ),
        EmailLog(
            sender_id=user["id"],
            recipient_id=creator.id,
            recipient_email="filter@example.com",
            recipient_name="Two",
            subject="failed-one",
            body="b2",
            status="failed",
            replied=False,
            sent_at=now - timedelta(minutes=1),
        ),
        EmailLog(
            sender_id=user["id"],
            recipient_id=creator.id,
            recipient_email="filter@example.com",
            recipient_name="Three",
            subject="latest-sent-replied",
            body="b3",
            status="sent",
            replied=True,
            sent_at=now,
        ),
    ]
    db_session.add_all(logs)
    db_session.commit()

    filtered = client.get(
        "/emails/logs",
        params={"status": "sent", "replied": True},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert filtered.status_code == 200
    body = filtered.json()
    assert body["total"] == 1
    assert len(body["items"]) == 1
    assert body["items"][0]["subject"] == "latest-sent-replied"

    paged = client.get(
        "/emails/logs",
        params={"skip": 1, "limit": 1},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert paged.status_code == 200
    paged_body = paged.json()
    assert paged_body["total"] == 3
    assert len(paged_body["items"]) == 1
    # Desc by sent_at: skip latest, second row should be failed-one
    assert paged_body["items"][0]["subject"] == "failed-one"


def test_creator_filters_sharelink_and_followers(client):
    user = _register(client, "creator_filter_user", "secret123")
    token = _login(client, "creator_filter_user", "secret123")

    _push_creators(
        client,
        user["api_key"],
        [
            {
                "platform": "TikTok",
                "unique_id": "f1",
                "data": {"nickname": "NoLink", "followerCount": "500", "locationCreated": "US"},
            },
            {
                "platform": "TikTok",
                "unique_id": "f2",
                "data": {"nickname": "WithLink", "followerCount": "1.2K", "shareLinks": ["https://x.com/a"], "locationCreated": "SG"},
            },
            {
                "platform": "TikTok",
                "unique_id": "f3",
                "data": {"nickname": "Big", "followerCount": "2M", "country": "JP"},
            },
        ],
    )

    has_link = client.get(
        "/creators/",
        params={"has_sharelink": True},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert has_link.status_code == 200
    has_link_body = has_link.json()
    assert has_link_body["total"] == 1
    assert has_link_body["items"][0]["unique_id"] == "f2"

    follower_range = client.get(
        "/creators/",
        params={"min_followers": 1000, "max_followers": 1500000},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert follower_range.status_code == 200
    follower_body = follower_range.json()
    assert follower_body["total"] == 1
    assert follower_body["items"][0]["unique_id"] == "f2"

    location_filter = client.get(
        "/creators/",
        params={"location": "SG|新加坡|Singapore"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert location_filter.status_code == 200
    location_body = location_filter.json()
    assert location_body["total"] == 1
    assert location_body["items"][0]["unique_id"] == "f2"


def test_2fa_disable_requires_password_and_code(client):
    _register(client, "otp_disable_user", "otp_pass_123")
    token = _login(client, "otp_disable_user", "otp_pass_123")

    setup = client.post("/users/me/2fa/setup", headers={"Authorization": f"Bearer {token}"})
    assert setup.status_code == 200
    secret = setup.json()["secret"]
    code = pyotp.TOTP(secret).now()

    enabled = client.post(
        "/users/me/2fa/enable",
        json={"code": code},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert enabled.status_code == 200
    assert enabled.json()["two_fa_enabled"] is True

    wrong_pwd = client.post(
        "/users/me/2fa/disable",
        json={"current_password": "wrong", "code": pyotp.TOTP(secret).now()},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert wrong_pwd.status_code == 403

    wrong_code = client.post(
        "/users/me/2fa/disable",
        json={"current_password": "otp_pass_123", "code": "000000"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert wrong_code.status_code == 403

    ok = client.post(
        "/users/me/2fa/disable",
        json={"current_password": "otp_pass_123", "code": pyotp.TOTP(secret).now()},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert ok.status_code == 200
    assert ok.json()["two_fa_enabled"] is False
