"""
Периодические email-отчёты (дайджесты) для пользователей.

Цели:
- учитывать настройки (UserCommunicationPreference: kind=report, email_enabled)
- быть идемпотентными (ReportEmailDeliveryLog: уникальность по периоду)
- работать без внешних брокеров/cron (встроенный background loop)
"""

import uuid
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import TYPE_CHECKING

from sqlmodel import func, select

from app.core.config import settings
from app.models import (
    Item,
    Notification,
    ReportEmailDeliveryLog,
    User,
    UserCommunicationPreference,
    WorkOrder,
)
from app.utils import send_email

if TYPE_CHECKING:
    from sqlmodel import Session


REPORT_WEEKLY_SUMMARY = "weekly_summary"
REPORT_MONTHLY_MAINTENANCE = "monthly_maintenance"


@dataclass(frozen=True)
class DueReport:
    key: str
    period_start: date
    period_end: date
    subject: str


def _report_enabled_for_user(session: "Session", user_id: uuid.UUID, report_key: str) -> bool:
    pref = session.exec(
        select(UserCommunicationPreference)
        .where(
            UserCommunicationPreference.user_id == user_id,
            UserCommunicationPreference.kind == "report",
            UserCommunicationPreference.key == report_key,
        )
        .limit(1)
    ).first()
    # дефолт: отчёты по email выключены, пользователь должен явно включить
    if not pref:
        return False
    return bool(pref.email_enabled)


def _already_sent(
    session: "Session", user_id: uuid.UUID, report_key: str, period_start: date, period_end: date
) -> bool:
    existing = session.exec(
        select(ReportEmailDeliveryLog).where(
            ReportEmailDeliveryLog.user_id == user_id,
            ReportEmailDeliveryLog.report_key == report_key,
            ReportEmailDeliveryLog.period_start == period_start,
            ReportEmailDeliveryLog.period_end == period_end,
            ReportEmailDeliveryLog.status == "sent",
        )
    ).first()
    return existing is not None


def _html_layout(title: str, subtitle: str, blocks: list[str]) -> str:
    # Упрощённый “коммерческий” шаблон: контейнер, типографика, карточки
    content = "\n".join(blocks)
    return f"""
<div style="font-family: -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Arial,sans-serif; background:#f6f7fb; padding:24px;">
  <div style="max-width:680px; margin:0 auto; background:#ffffff; border:1px solid #e6e8f0; border-radius:12px; overflow:hidden;">
    <div style="padding:20px 24px; background:#0f172a; color:#ffffff;">
      <div style="font-size:16px; opacity:0.9;">{settings.PROJECT_NAME}</div>
      <div style="font-size:22px; font-weight:700; margin-top:6px;">{title}</div>
      <div style="font-size:13px; opacity:0.85; margin-top:6px;">{subtitle}</div>
    </div>
    <div style="padding:20px 24px;">
      {content}
      <div style="margin-top:18px; font-size:12px; color:#64748b;">
        Вы получили это письмо, потому что включили рассылку отчётов в настройках профиля.
      </div>
    </div>
  </div>
</div>
""".strip()


def _card(title: str, body_html: str) -> str:
    return f"""
<div style="border:1px solid #e6e8f0; border-radius:10px; padding:14px 16px; margin-bottom:12px;">
  <div style="font-weight:700; margin-bottom:8px;">{title}</div>
  <div style="font-size:13px; color:#0f172a; line-height:1.45;">{body_html}</div>
</div>
""".strip()


def _weekly_summary_html(session: "Session", user: User, period_start: date, period_end: date) -> str:
    # Items created in period
    dt_from = datetime.combine(period_start, datetime.min.time()).replace(tzinfo=timezone.utc)
    dt_to = datetime.combine(period_end, datetime.max.time()).replace(tzinfo=timezone.utc)

    created_count = session.exec(
        select(func.count()).select_from(Item).where(
            Item.owner_id == user.id,
            Item.created_at >= dt_from,
            Item.created_at <= dt_to,
        )
    ).one()

    # Work orders assigned to user (active)
    open_wo = session.exec(
        select(func.count()).select_from(WorkOrder).where(
            WorkOrder.assigned_to_id == user.id,
            WorkOrder.status.in_(["open", "in_progress", "waiting_parts"]),
        )
    ).one()

    unread_notifications = session.exec(
        select(func.count()).select_from(Notification).where(
            Notification.user_id == user.id,
            Notification.is_read.is_(False),
            Notification.archived_at.is_(None),
        )
    ).one()

    blocks = [
        _card(
            "Склад",
            f"Создано позиций за период: <b>{created_count}</b>.",
        ),
        _card(
            "Заявки на обслуживание",
            f"Активных заявок, назначенных на вас: <b>{open_wo}</b>.",
        ),
        _card(
            "Уведомления",
            f"Непрочитанных уведомлений в приложении: <b>{unread_notifications}</b>.",
        ),
    ]

    subtitle = f"Период: {period_start.isoformat()} — {period_end.isoformat()}"
    return _html_layout("Еженедельная сводка", subtitle, blocks)


def _monthly_maintenance_html(session: "Session", user: User, period_start: date, period_end: date) -> str:
    dt_from = datetime.combine(period_start, datetime.min.time()).replace(tzinfo=timezone.utc)
    dt_to = datetime.combine(period_end, datetime.max.time()).replace(tzinfo=timezone.utc)

    created_wo = session.exec(
        select(func.count()).select_from(WorkOrder).where(
            WorkOrder.created_at >= dt_from,
            WorkOrder.created_at <= dt_to,
        )
    ).one()
    done_wo = session.exec(
        select(func.count()).select_from(WorkOrder).where(
            WorkOrder.status == "done",
            WorkOrder.updated_at >= dt_from,
            WorkOrder.updated_at <= dt_to,
        )
    ).one()

    blocks = [
        _card(
            "Заявки",
            f"Создано заявок за период: <b>{created_wo}</b>.<br/>"
            f"Завершено заявок за период: <b>{done_wo}</b>.",
        ),
        _card(
            "Подсказка",
            "Если вам нужен отчёт в другом формате (PDF/Excel) — это можно добавить следующим шагом.",
        ),
    ]
    subtitle = f"Период: {period_start.isoformat()} — {period_end.isoformat()}"
    return _html_layout("Ежемесячный отчёт по обслуживанию", subtitle, blocks)


def compute_due_reports(now_utc: datetime) -> list[DueReport]:
    """
    Расписание:
    - weekly_summary: каждый понедельник в 09:00 UTC, период = последние 7 дней (пн-вс, до вчера)
    - monthly_maintenance: 1-го числа в 09:00 UTC, период = прошлый календарный месяц
    """
    now_utc = now_utc.astimezone(timezone.utc)
    due: list[DueReport] = []

    # Weekly: Monday 09:00
    if now_utc.weekday() == 0 and now_utc.hour == 9:
        end = (now_utc.date() - timedelta(days=1))
        start = end - timedelta(days=6)
        due.append(
            DueReport(
                key=REPORT_WEEKLY_SUMMARY,
                period_start=start,
                period_end=end,
                subject=f"{settings.PROJECT_NAME}: еженедельная сводка ({start.isoformat()}–{end.isoformat()})",
            )
        )

    # Monthly: day 1 09:00
    if now_utc.day == 1 and now_utc.hour == 9:
        first_of_this_month = now_utc.date().replace(day=1)
        last_of_prev_month = first_of_this_month - timedelta(days=1)
        start_prev = last_of_prev_month.replace(day=1)
        due.append(
            DueReport(
                key=REPORT_MONTHLY_MAINTENANCE,
                period_start=start_prev,
                period_end=last_of_prev_month,
                subject=f"{settings.PROJECT_NAME}: отчёт за месяц ({start_prev.isoformat()}–{last_of_prev_month.isoformat()})",
            )
        )

    return due


def send_due_reports(session: "Session", now_utc: datetime) -> int:
    """
    Отправляет все отчёты, которые “должны” уйти в текущий час.
    Возвращает количество успешно отправленных писем.
    """
    if not settings.emails_enabled:
        return 0

    due_reports = compute_due_reports(now_utc)
    if not due_reports:
        return 0

    users = list(
        session.exec(
            select(User).where(User.is_active.is_(True), User.deleted_at.is_(None))
        ).all()
    )

    sent = 0
    for dr in due_reports:
        for user in users:
            if not user.email:
                continue
            if not _report_enabled_for_user(session, user.id, dr.key):
                continue
            if _already_sent(session, user.id, dr.key, dr.period_start, dr.period_end):
                continue

            try:
                if dr.key == REPORT_WEEKLY_SUMMARY:
                    html = _weekly_summary_html(session, user, dr.period_start, dr.period_end)
                elif dr.key == REPORT_MONTHLY_MAINTENANCE:
                    html = _monthly_maintenance_html(session, user, dr.period_start, dr.period_end)
                else:
                    continue

                send_email(email_to=str(user.email), subject=dr.subject, html_content=html)
                session.add(
                    ReportEmailDeliveryLog(
                        user_id=user.id,
                        report_key=dr.key,
                        period_start=dr.period_start,
                        period_end=dr.period_end,
                        status="sent",
                        error=None,
                    )
                )
                session.commit()
                sent += 1
            except Exception as e:
                # фиксируем ошибку, но не падаем всем воркером
                session.add(
                    ReportEmailDeliveryLog(
                        user_id=user.id,
                        report_key=dr.key,
                        period_start=dr.period_start,
                        period_end=dr.period_end,
                        status="failed",
                        error=str(e)[:2048],
                    )
                )
                session.commit()
    return sent

