"""Генерация PDF: накладная по отгрузке и этикетка со штрихкодом."""

import os
from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    Flowable,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from app.models import Item


class _DrawingFlowable(Flowable):
    """Обёртка для reportlab Drawing, чтобы вставить в story."""

    def __init__(self, drawing):
        super().__init__()
        self.drawing = drawing

    def wrap(self, availWidth, availHeight):
        return (float(self.drawing.width), float(self.drawing.height))

    def draw(self):
        self.drawing.drawOn(self.canv, 0, 0)

# Шрифты с поддержкой кириллицы (иначе в PDF будут квадраты вместо букв)
PDF_FONT = "Helvetica"
PDF_FONT_BOLD = "Helvetica-Bold"

_cyrillic_font_registered = False


def _register_cyrillic_fonts() -> None:
    global _cyrillic_font_registered, PDF_FONT, PDF_FONT_BOLD
    if _cyrillic_font_registered:
        return
    base_dir = os.path.dirname(os.path.abspath(__file__))
    candidates = [
        (os.path.join(base_dir, "fonts", "DejaVuSans.ttf"), os.path.join(base_dir, "fonts", "DejaVuSans-Bold.ttf")),
        ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
        ("/usr/share/fonts/TTF/DejaVuSans.ttf", "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf"),
    ]
    for path_regular, path_bold in candidates:
        if os.path.isfile(path_regular):
            try:
                pdfmetrics.registerFont(TTFont("DejaVuSans", path_regular))
                if os.path.isfile(path_bold):
                    pdfmetrics.registerFont(TTFont("DejaVuSans-Bold", path_bold))
                else:
                    pdfmetrics.registerFont(TTFont("DejaVuSans-Bold", path_regular))
                PDF_FONT = "DejaVuSans"
                PDF_FONT_BOLD = "DejaVuSans-Bold"
                _cyrillic_font_registered = True
                return
            except Exception:
                pass
    _cyrillic_font_registered = True


def _logo_flowable(max_width_pt: float):
    """Загружает fastapi-logo.svg и возвращает центрированную таблицу с логотипом или None."""
    base_dir = os.path.dirname(os.path.abspath(__file__))
    svg_path = os.path.join(base_dir, "assets", "fastapi-logo.svg")
    if not os.path.isfile(svg_path):
        return None
    try:
        from svglib.svglib import svg2rlg

        drawing = svg2rlg(svg_path)
        if drawing is None:
            return None
        scale = max_width_pt / float(drawing.width)
        drawing.width = max_width_pt
        drawing.height = float(drawing.height) * scale
        drawing.scale(scale, scale)
        flowable = _DrawingFlowable(drawing)
        content_width = A4[0] - 40 * mm
        logo_table = Table([[flowable]], colWidths=[content_width])
        logo_table.setStyle(
            TableStyle([("ALIGN", (0, 0), (-1, -1), "CENTRE"), ("VALIGN", (0, 0), (-1, -1), "MIDDLE")])
        )
        return logo_table
    except Exception:
        return None


def _get_item_display(item: Item) -> dict:
    return {
        "title": item.title or "",
        "sku": item.sku or "—",
        "quantity": item.quantity or 1,
        "unit": item.unit or "—",
        "barcode": item.barcode or "—",
    }


def build_shipping_note_pdf(items: list[Item]) -> bytes:
    """PDF накладная по списку товаров (таблица)."""
    _register_cyrillic_fonts()
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=20 * mm,
        leftMargin=20 * mm,
        topMargin=5 * mm,  
        bottomMargin=20 * mm,
    )
    styles = getSampleStyleSheet()
    styles["Title"].fontName = PDF_FONT_BOLD
    styles["Normal"].fontName = PDF_FONT
    story = []

    content_width_pt = A4[0] - 40 * mm
    logo_table = _logo_flowable(max_width_pt=25 * mm)
    if logo_table is not None:
        story.append(logo_table)
        story.append(Spacer(1, 6 * mm))
    title = Paragraph("Товарная накладная", styles["Title"])
    story.append(title)
    story.append(Paragraph("<br/>", styles["Normal"]))

    if not items:
        story.append(Paragraph("Нет позиций.", styles["Normal"]))
    else:
        data = [["№", "Название", "Артикул", "Кол-во", "Ед.", "Штрихкод"]]
        for i, item in enumerate(items, 1):
            d = _get_item_display(item)
            data.append([
                str(i),
                d["title"][:40],
                d["sku"][:20],
                str(d["quantity"]),
                d["unit"][:8],
                (d["barcode"] or "—")[:20],
            ])

        table = Table(data, colWidths=[20 * mm, 60 * mm, 35 * mm, 25 * mm, 20 * mm, 40 * mm])
        table.setStyle(
            TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.grey),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
                ("ALIGN", (0, 0), (-1, -1), "LEFT"),
                ("ALIGN", (3, 0), (3, -1), "RIGHT"),
                ("FONTNAME", (0, 0), (-1, 0), PDF_FONT_BOLD),
                ("FONTSIZE", (0, 0), (-1, 0), 10),
                ("BOTTOMPADDING", (0, 0), (-1, 0), 8),
                ("BACKGROUND", (0, 1), (-1, -1), colors.beige),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.black),
                ("FONTNAME", (0, 1), (-1, -1), PDF_FONT),
                ("FONTSIZE", (0, 1), (-1, -1), 9),
            ])
        )
        story.append(table)

    doc.build(story)
    return buffer.getvalue()


def build_label_pdf(item: Item) -> bytes:
    """PDF этикетка одного товара (название, артикул, кол-во, штрихкод при наличии)."""
    from reportlab.graphics.barcode import code128
    from reportlab.pdfgen import canvas

    _register_cyrillic_fonts()
    buffer = BytesIO()
    width, height = 70 * mm, 50 * mm
    c = canvas.Canvas(buffer, pagesize=(width, height))
    c.setFont(PDF_FONT, 10)

    y = height - 10 * mm
    c.drawString(5 * mm, y, (item.title or "")[:35])
    y -= 6 * mm
    c.drawString(5 * mm, y, f"Артикул: {item.sku or '—'}")
    y -= 5 * mm
    c.drawString(5 * mm, y, f"Кол-во: {item.quantity or 1} {item.unit or ''}")

    if item.barcode and item.barcode.strip():
        try:
            barcode = code128.Code128(
                item.barcode.strip()[:50],
                barHeight=8 * mm,
                barWidth=0.4,
            )
            barcode.drawOn(c, 5 * mm, 5 * mm)
        except Exception:
            c.setFont(PDF_FONT, 8)
            c.drawString(5 * mm, 6 * mm, f"Штрихкод: {item.barcode}")

    c.showPage()
    c.save()
    return buffer.getvalue()
