from sqlalchemy.orm import Session
from sqlalchemy import func, and_, desc
from app.domains.dashboard import schemas
from app.domains.creator.models import Creator
from app.domains.email.models import EmailLog
from datetime import datetime, timedelta
import random

class DashboardService:
    @staticmethod
    def get_stats(db: Session, user_id: int) -> schemas.DashboardStats:
        today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        yesterday = today - timedelta(days=1)
        
        # 1. Stats Cards
        # New Creators Today
        today_creators = db.query(Creator).filter(
            Creator.owner_id == user_id,
            Creator.created_at >= today
        ).count()
        
        yesterday_creators = db.query(Creator).filter(
            Creator.owner_id == user_id,
            Creator.created_at >= yesterday,
            Creator.created_at < today
        ).count()
        
        creator_diff = today_creators - yesterday_creators
        creator_trend = f"{abs(creator_diff / yesterday_creators * 100):.1f}%" if yesterday_creators > 0 else "100%"
        
        # Emails Sent (Total)
        total_emails = db.query(EmailLog).filter(EmailLog.sender_id == user_id).count()
        
        # Reply Rate
        replied_emails = db.query(EmailLog).filter(
            EmailLog.sender_id == user_id,
            EmailLog.replied == True
        ).count()
        reply_rate = f"{(replied_emails / total_emails * 100):.1f}%" if total_emails > 0 else "0%"
        
        stat_cards = [
            schemas.StatCard(
                label="今日新增网红",
                value=str(today_creators),
                trend=creator_trend,
                isUp=creator_diff >= 0,
                icon="person_add",
                bgClass="bg-blue-50 dark:bg-blue-900/30",
                iconColor="text-primary"
            ),
            schemas.StatCard(
                label="已发送邮件",
                value=str(total_emails),
                trend="0%", # Calculating real trend requires more complex query, skipping for now
                isUp=True,
                icon="send",
                bgClass="bg-purple-50 dark:bg-purple-900/30",
                iconColor="text-purple-600"
            ),
            schemas.StatCard(
                label="回复率",
                value=reply_rate,
                trend="0%",
                isUp=True,
                icon="chat_bubble",
                bgClass="bg-orange-50 dark:bg-orange-900/30",
                iconColor="text-orange-600"
            )
        ]
        
        # 2. Platform Distribution
        platform_counts = db.query(
            Creator.platform, func.count(Creator.id)
        ).filter(
            Creator.owner_id == user_id
        ).group_by(Creator.platform).all()
        
        colors = {"Instagram": "#137fec", "TikTok": "#ec4899", "YouTube": "#dc2626"}
        platform_dist = []
        for platform, count in platform_counts:
            # Capitalize platform name
            platform_name = platform.capitalize() if platform else "Unknown"
            platform_dist.append(schemas.PlatformStat(
                name=platform_name,
                value=count,
                color=colors.get(platform_name, "#888888")
            ))
        
        if not platform_dist: # Fallback if empty
             platform_dist = [
                 schemas.PlatformStat(name="Instagram", value=0, color="#137fec"),
                 schemas.PlatformStat(name="TikTok", value=0, color="#ec4899"),
                 schemas.PlatformStat(name="YouTube", value=0, color="#dc2626")
             ]

        # 3. Leads Trend (Last 7 days)
        leads_trend = []
        days_map = {0: "周一", 1: "周二", 2: "周三", 3: "周四", 4: "周五", 5: "周六", 6: "周日"}
        
        for i in range(6, -1, -1):
            day_start = today - timedelta(days=i)
            day_end = day_start + timedelta(days=1)
            count = db.query(Creator).filter(
                Creator.owner_id == user_id,
                Creator.created_at >= day_start,
                Creator.created_at < day_end
            ).count()
            leads_trend.append(schemas.ActivityStat(
                name=days_map[day_start.weekday()],
                count=count
            ))
            
        # 4. Recent Activity (Latest 5 creators)
        recent_creators = db.query(Creator).filter(
            Creator.owner_id == user_id
        ).order_by(desc(Creator.created_at)).limit(5).all()
        
        recent_activity = []
        for creator in recent_creators:
            time_diff = datetime.utcnow() - creator.created_at
            if time_diff.total_seconds() < 60:
                time_str = "刚刚"
            elif time_diff.total_seconds() < 3600:
                time_str = f"{int(time_diff.total_seconds() / 60)}分钟前"
            elif time_diff.total_seconds() < 86400:
                time_str = f"{int(time_diff.total_seconds() / 3600)}小时前"
            else:
                time_str = f"{int(time_diff.total_seconds() / 86400)}天前"
            
            # Extract name safely
            name = creator.unique_id
            if creator.data and isinstance(creator.data, dict):
                 name = creator.data.get('name') or creator.data.get('username') or creator.unique_id
            
            recent_activity.append(schemas.RecentActivity(
                id=creator.id,
                name=name,
                description=f"个人资料已从 {creator.platform} 抓取" if creator.platform else "新增线索",
                time=time_str,
                avatar=f"https://ui-avatars.com/api/?name={name}&background=random" # Simple fallback avatar
            ))

        return schemas.DashboardStats(
            stats=stat_cards,
            platform_distribution=platform_dist,
            leads_trend=leads_trend,
            recent_activity=recent_activity
        )
