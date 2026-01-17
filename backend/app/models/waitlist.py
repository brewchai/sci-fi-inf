from datetime import datetime
from sqlalchemy import String, DateTime, Boolean
from sqlalchemy.orm import Mapped, mapped_column
from app.db.session import Base


class WaitlistEmail(Base):
    """Store early access waitlist signups."""
    __tablename__ = "waitlist_emails"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    is_notified: Mapped[bool] = mapped_column(Boolean, default=False)
