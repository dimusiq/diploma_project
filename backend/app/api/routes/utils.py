from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from pydantic.networks import EmailStr
from sqlmodel import select

from app.api.deps import SessionDep, get_current_active_superuser
from app.models import Message
from app.services.report_email_service import send_due_reports
from app.utils import generate_test_email, send_email

router = APIRouter(prefix="/utils", tags=["utils"])


@router.post(
    "/test-email/",
    dependencies=[Depends(get_current_active_superuser)],
    status_code=201,
)
def test_email(email_to: EmailStr) -> Message:
    """
    Test emails.
    """
    email_data = generate_test_email(email_to=email_to)
    send_email(
        email_to=email_to,
        subject=email_data.subject,
        html_content=email_data.html_content,
    )
    return Message(message="Test email sent")


@router.post(
    "/send-due-reports/",
    dependencies=[Depends(get_current_active_superuser)],
    status_code=200,
)
def send_due_reports_now(session: SessionDep) -> dict:
    """
    Ручной запуск рассылки “отчётов, которые должны уйти сейчас”.
    Полезно для проверки в dev/staging без ожидания расписания.
    """
    now = datetime.now(timezone.utc)
    sent = send_due_reports(session, now)
    return {"message": "ok", "sent": sent, "now": now.isoformat()}


@router.get("/health-check/")
async def health_check() -> bool:
    return True


@router.get("/health", response_model=None)
def health_with_db(session: SessionDep) -> dict:
    """
    Health check for load balancers/monitoring. Returns 200 with database status.
    """
    try:
        session.exec(select(1)).one()
        db_status = "ok"
    except Exception:
        db_status = "error"
    return {"status": "ok" if db_status == "ok" else "degraded", "database": db_status}
