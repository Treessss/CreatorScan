
from sqlalchemy.orm import Session
from app.domains.email import repository, utils, schemas
from app.domains.email.models import SmtpConfig
from app.domains.user.repository import get_user_by_id
from app.domains.creator.models import Creator
from app.core.exceptions import AuthError

class EmailService:
    @staticmethod
    def create_smtp_config(db: Session, user_id: int, config: schemas.SmtpConfigCreate):
        if config.is_default:
            # Unset other defaults
            db.query(SmtpConfig).filter(SmtpConfig.user_id == user_id).update({"is_default": False})
        
        db_config = SmtpConfig(**config.dict(), user_id=user_id)
        db.add(db_config)
        db.commit()
        db.refresh(db_config)
        return db_config

    @staticmethod
    def get_smtp_configs(db: Session, user_id: int):
        return db.query(SmtpConfig).filter(SmtpConfig.user_id == user_id).all()
        
    @staticmethod
    def update_smtp_config(db: Session, user_id: int, config_id: int, config: schemas.SmtpConfigUpdate):
        db_config = db.query(SmtpConfig).filter(SmtpConfig.id == config_id, SmtpConfig.user_id == user_id).first()
        if not db_config:
            return None
            
        if config.is_default:
             db.query(SmtpConfig).filter(SmtpConfig.user_id == user_id).update({"is_default": False})
             
        for key, value in config.dict(exclude_unset=True).items():
            setattr(db_config, key, value)
            
        db.commit()
        db.refresh(db_config)
        return db_config
        
    @staticmethod
    def delete_smtp_config(db: Session, user_id: int, config_id: int):
        db_config = db.query(SmtpConfig).filter(SmtpConfig.id == config_id, SmtpConfig.user_id == user_id).first()
        if db_config:
            db.delete(db_config)
            db.commit()
            return True
        return False
        
    @staticmethod
    def test_smtp_connection(config: schemas.SmtpConfigBase):
        try:
            # We can use utils.send_smtp but with a dry run or just login check
            # For now, let's just try to send a test email to self if possible or just login
            # Let's assume utils has a check_login function or we implement a simple one here or reuse send_smtp
            # Reusing send_smtp is easiest if we send to self
            success, error = utils.send_smtp(
                config.host, config.port, config.username, config.password,
                config.username, "Test Connection", "This is a test email from CreatorScan."
            )
            return success, error
        except Exception as e:
            return False, str(e)

    @staticmethod
    def send_batch_emails(db: Session, user_id: int, creator_ids: list[int], subject: str, body: str, smtp_config_id: int = None):
        # Resolve SMTP Config
        smtp_config = None
        if smtp_config_id:
             smtp_config = db.query(SmtpConfig).filter(SmtpConfig.id == smtp_config_id, SmtpConfig.user_id == user_id).first()
        
        if not smtp_config:
             # Default
             smtp_config = db.query(SmtpConfig).filter(SmtpConfig.user_id == user_id, SmtpConfig.is_default == True).first()
        
        if not smtp_config:
             # Fallback to any
             smtp_config = db.query(SmtpConfig).filter(SmtpConfig.user_id == user_id).first()

        if not smtp_config:
             print(f"User {user_id} missing SMTP config")
             return

        for cid in creator_ids:
            creator = db.query(Creator).filter(Creator.id == cid).first()
            if not creator: continue
            
            email_addr = creator.data.get('email') or creator.data.get('Email')
            if not email_addr: continue
            
            success, error = utils.send_smtp(
                smtp_config.host, smtp_config.port, smtp_config.username, smtp_config.password,
                email_addr, subject, body
            )
            
            status = 'sent' if success else f'failed: {error}'
            repository.create_email_log(db, user_id, creator.id, subject, body, status, email_addr, recipient_name, smtp_config.id)

    @staticmethod
    def sync_replies(db: Session, user_id: int):
        # For sync, we might need to iterate ALL active SMTP configs?
        # Or just the default? Usually you want to check all inboxes.
        configs = db.query(SmtpConfig).filter(SmtpConfig.user_id == user_id).all()
        
        if not configs:
            return

        sent_logs = repository.get_unreplied_sent_logs(db, user_id)
        if not sent_logs:
            return

        # Prepare check list
        criteria = []
        for log in sent_logs:
            if log.recipient and log.recipient.data:
                email = log.recipient.data.get('email') or log.recipient.data.get('Email')
                if email:
                    criteria.append({'email_log_id': log.id, 'recipient_email': email})
        
        # We need to map logs to which SMTP account sent them? 
        # Ideally EmailLog should record smtp_config_id. 
        # But for now, we can try to check all inboxes for these recipients.
        
        for config in configs:
            replies = utils.check_imap_replies(
                config.host, config.username, config.password, criteria
            )
            
            for reply in replies:
                repository.update_email_reply(
                    db, reply['email_log_id'], reply['content'], reply.get('replied_at')
                )

    @staticmethod
    def enrich_creators_with_email_status(db: Session, creators):
        # This helper function injects status into creator objects
        # To avoid N+1, we could batch fetch latest logs
        for creator in creators:
            latest = repository.get_latest_log_for_recipient(db, creator.id)
            if latest:
                creator.email_status = latest.status
                creator.has_replied = latest.replied
                creator.latest_reply_content = latest.reply_content
            else:
                creator.email_status = "not_sent"
                creator.has_replied = False
        return creators
    
    @staticmethod
    def get_logs(db: Session, user_id: int):
        return repository.get_logs_by_sender(db, user_id)

    @staticmethod
    def get_logs_with_pagination(db: Session, user_id: int, skip: int = 0, limit: int = 50, status: str = None, replied: bool = None):
        """获取邮件日志（支持分页和筛选）"""
        return repository.get_logs_by_sender_with_pagination(db, user_id, skip, limit, status, replied)

    @staticmethod
    def get_email_stats(db: Session, user_id: int):
        """获取邮件统计信息"""
        from sqlalchemy import func

        total_sent = db.query(func.count(repository.EmailLog.id)).filter(
            repository.EmailLog.sender_id == user_id,
            repository.EmailLog.status == 'sent'
        ).scalar()

        total_replied = db.query(func.count(repository.EmailLog.id)).filter(
            repository.EmailLog.sender_id == user_id,
            repository.EmailLog.replied == True
        ).scalar()

        reply_rate = (total_replied / total_sent * 100) if total_sent > 0 else 0

        return {
            "total_sent": total_sent,
            "total_replied": total_replied,
            "reply_rate": round(reply_rate, 2)
        }
