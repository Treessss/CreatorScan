from app.core.database import SessionLocal
from app.domains.creator.models import Creator
from app.domains.user.models import User
from app.domains.email.models import EmailLog

db = SessionLocal()
try:
    # Check 5 rows
    creators = db.query(Creator).limit(5).all()
    for c in creators:
        print(f"ID: {c.id}, Data keys: {c.data.keys()}")
        if 'followerCount' in c.data:
            print(f"  followerCount: {c.data['followerCount']} (Type: {type(c.data['followerCount'])})")
        else:
            print("  followerCount not found in keys")
            
        # Check for share link keys
        share_keys = [k for k in c.data.keys() if 'share' in k.lower() or 'link' in k.lower()]
        print(f"  Share/Link related keys: {share_keys}")
        for k in share_keys:
             print(f"    {k}: {c.data[k]}")

finally:
    db.close()
