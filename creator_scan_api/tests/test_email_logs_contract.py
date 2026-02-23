from app.domains.email.models import EmailLog
from app.domains.creator.models import Creator


def _register(client, username: str = "mailer", password: str = "secret123"):
    response = client.post("/users/register", json={"username": username, "password": password})
    assert response.status_code == 200
    return response.json()


def _login(client, username: str = "mailer", password: str = "secret123"):
    response = client.post("/token", data={"username": username, "password": password})
    assert response.status_code == 200
    return response.json()["access_token"]


def test_email_logs_paginated_contract(client, db_session):
    user = _register(client)
    token = _login(client)

    creator = Creator(platform="TikTok", unique_id="mail_target", data={"email": "target@example.com"}, owner_id=user["id"])
    db_session.add(creator)
    db_session.commit()
    db_session.refresh(creator)

    log = EmailLog(
        sender_id=user["id"],
        recipient_id=creator.id,
        recipient_email="target@example.com",
        recipient_name="Mail Target",
        subject="hello",
        body="test body",
        status="sent",
        replied=False,
    )
    db_session.add(log)
    db_session.commit()

    response = client.get("/emails/logs", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    body = response.json()

    assert "items" in body
    assert "total" in body
    assert body["total"] == 1
    assert len(body["items"]) == 1
    assert body["items"][0]["recipient_email"] == "target@example.com"
