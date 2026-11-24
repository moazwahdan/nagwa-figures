"""Local Figure Studio user guide (not published to GitHub)."""
from pathlib import Path
from fpdf import FPDF

SHOTS = Path(__file__).with_name("guide-shots")
OUT = Path(__file__).with_name("Nagwa-Figure-Studio-User-Guide.pdf")
FONT = Path(r"C:\Windows\Fonts\segoeui.ttf")
FONT_B = Path(r"C:\Windows\Fonts\segoeuib.ttf")

# Sampled from the live studio UI
TEAL = (20, 121, 109)
TEAL_SOFT = (232, 245, 242)
INK = (28, 35, 52)
MUTED = (108, 118, 144)
LINE = (226, 230, 239)
PAPER = (242, 244, 248)
WHITE = (255, 255, 255)
GOLD = (138, 90, 0)
GOLD_BG = (255, 244, 224)
PURPLE = (90, 70, 200)
BLUE = (79, 107, 237)


class Guide(FPDF):
    def header(self):
        if self.page_no() == 1:
            return
        self.set_fill_color(*TEAL)
        self.rect(0, 0, 210, 8, "F")
        self.set_xy(16, 10)
        self.set_font("Ui", "B", 9)
        self.set_text_color(*TEAL)
        self.cell(120, 6, "Figure Studio  ·  User guide")
        self.set_font("Ui", "", 9)
        self.set_text_color(*MUTED)
        self.cell(0, 6, "How to draw bilingual figures", align="R")
        self.set_draw_color(*LINE)
        self.set_line_width(0.3)
        self.line(16, 18, 194, 18)
        self.set_y(22)
        self.set_text_color(*INK)

    def footer(self):
        if self.page_no() == 1:
            return
        self.set_y(-14)
        self.set_draw_color(*LINE)
        self.line(16, self.get_y(), 194, self.get_y())
        self.set_y(-12)
        self.set_font("Ui", "", 8)
        self.set_text_color(*MUTED)
        self.cell(0, 8, str(self.page_no()), align="C")


def write(pdf: Guide, text: str, size=11, color=INK, h=5.6, indent=0, bold=False):
    pdf.set_font("Ui", "B" if bold else "", size)
    pdf.set_text_color(*color)
    pdf.set_x(pdf.l_margin + indent)
    pdf.multi_cell(pdf.epw - indent, h, text)


def heading(pdf: Guide, title: str, n: str):
    pdf.ln(3)
    y = pdf.get_y()
    if y > 250:
        pdf.add_page()
        y = pdf.get_y()
    pdf.set_fill_color(*TEAL)
    pdf.circle(pdf.l_margin + 3.2, y + 4.2, 3.4, "F")
    pdf.set_xy(pdf.l_margin, y + 1.4)
    pdf.set_font("Ui", "B", 8)
    pdf.set_text_color(*WHITE)
    pdf.cell(8, 5.5, n, align="C")
    pdf.set_xy(pdf.l_margin + 10, y)
    pdf.set_font("Ui", "B", 14)
    pdf.set_text_color(*INK)
    pdf.cell(0, 9, title, new_x="LMARGIN", new_y="NEXT")
    pdf.ln(1)


def callout(pdf: Guide, title: str, body: str, fill=TEAL_SOFT, accent=TEAL):
    pdf.ln(1)
    start = pdf.get_y()
    pdf.set_x(pdf.l_margin)
    x, w = pdf.l_margin, pdf.epw
    pdf.set_font("Ui", "B", 10)
    title_h = 6
    pdf.set_font("Ui", "", 10)
    # estimate
    pdf.set_fill_color(*fill)
    pdf.set_draw_color(*accent)
    y0 = pdf.get_y()
    pdf.set_font("Ui", "B", 10)
    pdf.set_text_color(*accent)
    pdf.set_xy(x + 6, y0 + 3)
    pdf.multi_cell(w - 12, 5, title)
    pdf.set_font("Ui", "", 10)
    pdf.set_text_color(*INK)
    pdf.set_x(x + 6)
    pdf.multi_cell(w - 12, 5.2, body)
    y1 = pdf.get_y() + 3
    pdf.set_fill_color(*fill)
    pdf.rect(x, y0, w, y1 - y0, "F")
    pdf.set_fill_color(*accent)
    pdf.rect(x, y0, 1.6, y1 - y0, "F")
    pdf.set_xy(x + 6, y0 + 3)
    pdf.set_font("Ui", "B", 10)
    pdf.set_text_color(*accent)
    pdf.multi_cell(w - 12, 5, title)
    pdf.set_font("Ui", "", 10)
    pdf.set_text_color(*INK)
    pdf.set_x(x + 6)
    pdf.multi_cell(w - 12, 5.2, body)
    pdf.set_y(y1)
    pdf.ln(1)


def shot(pdf: Guide, name: str, caption: str, max_h=78):
    path = SHOTS / name
    if not path.exists():
        return
    from PIL import Image
    im = Image.open(path)
    iw, ih = im.size
    max_w = pdf.epw
    w = max_w
    h = w * ih / iw
    if h > max_h:
        h = max_h
        w = h * iw / ih
    if pdf.get_y() + h + 12 > 275:
        pdf.add_page()
    x = pdf.l_margin + (pdf.epw - w) / 2
    y = pdf.get_y()
    pdf.set_fill_color(*WHITE)
    pdf.set_draw_color(*LINE)
    pdf.set_line_width(0.35)
    pdf.rect(x - 1.2, y - 1.2, w + 2.4, h + 2.4, "FD")
    pdf.image(str(path), x=x, y=y, w=w, h=h)
    pdf.set_y(y + h + 3)
    write(pdf, caption, size=9, color=MUTED, h=4.6)


def keys_row(pdf: Guide, items: list[tuple[str, str]]):
    pdf.ln(1)
    x0 = pdf.l_margin
    y = pdf.get_y()
    col_w = pdf.epw
    for key, meaning in items:
        if y > 268:
            pdf.add_page()
            y = pdf.get_y()
        pdf.set_fill_color(*TEAL)
        pdf.set_text_color(*WHITE)
        pdf.set_font("Ui", "B", 9)
        kw = min(42, 8 + len(key) * 2.1)
        pdf.set_xy(x0, y)
        pdf.cell(kw, 7, f"  {key}  ", fill=True)
        pdf.set_font("Ui", "", 10)
        pdf.set_text_color(*INK)
        pdf.cell(col_w - kw - 2, 7, "   " + meaning, new_x="LMARGIN", new_y="NEXT")
        y = pdf.get_y() + 1.4
        pdf.set_y(y)
    pdf.ln(1)


def draw_mini_figures(pdf: Guide):
    """Simple ink figures in the studio style."""
    y = pdf.get_y()
    if y > 230:
        pdf.add_page()
        y = pdf.get_y()
    box_h = 42
    gap = 4
    w = (pdf.epw - gap * 2) / 3
    labels = ("Square + labels", "Force arrow", "Polyline")
    for i in range(3):
        x = pdf.l_margin + i * (w + gap)
        pdf.set_fill_color(*WHITE)
        pdf.set_draw_color(*LINE)
        pdf.rect(x, y, w, box_h, "FD")
        pdf.set_draw_color(20, 20, 20)
        pdf.set_line_width(0.7)
        cx, cy = x + w / 2, y + 18
        if i == 0:
            s = 11
            pdf.rect(cx - s, cy - s, 2 * s, 2 * s)
            pdf.set_font("Ui", "B", 8)
            pdf.set_text_color(*INK)
            pdf.text(cx - s - 4, cy + s + 1, "A")
            pdf.text(cx + s - 1, cy + s + 1, "B")
            pdf.text(cx + s - 1, cy - s + 2, "C")
            pdf.text(cx - s - 4, cy - s + 2, "D")
        elif i == 1:
            pdf.line(cx - 16, cy + 6, cx + 12, cy - 6)
            pdf.set_fill_color(20, 20, 20)
            pdf.polygon([(cx + 12, cy - 6), (cx + 5, cy - 9), (cx + 8, cy - 1)], style="F")
            pdf.set_font("Ui", "B", 8)
            pdf.text(cx + 10, cy - 10, "F")
        else:
            pts = [(cx - 16, cy + 8), (cx - 4, cy - 8), (cx + 6, cy + 2), (cx + 16, cy - 10)]
            for a, b in zip(pts, pts[1:]):
                pdf.line(*a, *b)
            pdf.set_fill_color(*TEAL)
            for px, py in pts:
                pdf.circle(px, py, 1.3, "F")
        pdf.set_font("Ui", "", 8)
        pdf.set_text_color(*MUTED)
        pdf.set_xy(x, y + box_h - 8)
        pdf.cell(w, 6, labels[i], align="C")
    pdf.set_y(y + box_h + 4)


def cover(pdf: Guide):
    pdf.add_page()
    pdf.set_fill_color(*TEAL)
    pdf.rect(0, 0, 210, 297, "F")
    pdf.set_fill_color(16, 96, 86)
    pdf.rect(0, 210, 210, 87, "F")
    pdf.set_fill_color(*WHITE)
    pdf.rect(18, 26, 20, 20, "F")
    pdf.set_font("Ui", "B", 11)
    pdf.set_text_color(*TEAL)
    pdf.set_xy(18, 31)
    pdf.cell(20, 10, "FS", align="C")
    pdf.set_text_color(*WHITE)
    pdf.set_font("Ui", "B", 32)
    pdf.set_xy(16, 70)
    pdf.multi_cell(178, 14, "Figure Studio")
    pdf.set_font("Ui", "", 16)
    pdf.set_xy(16, 100)
    pdf.multi_cell(178, 8, "User guide")
    pdf.set_font("Ui", "", 12)
    pdf.set_xy(16, 118)
    pdf.multi_cell(
        170,
        6.5,
        "Draw one figure. Review it in Arabic and English.\nExport white images ready for exams and slides.",
    )
    pdf.set_font("Ui", "", 11)
    pdf.set_xy(16, 228)
    pdf.multi_cell(
        178,
        6,
        "This booklet is for people who draw in the studio.\nIt shows the real screens, the important buttons, and the shortcuts.\nIt is not an installation manual.",
    )


def main() -> None:
    pdf = Guide(format="A4", unit="mm")
    pdf.set_margins(16, 24, 16)
    pdf.set_auto_page_break(auto=True, margin=16)
    pdf.add_font("Ui", "", str(FONT))
    pdf.add_font("Ui", "B", str(FONT_B))
    pdf.set_title("Figure Studio user guide")
    pdf.set_author("Figure Studio")

    cover(pdf)
    pdf.add_page()

    heading(pdf, "What you get", "01")
    write(
        pdf,
        "You compose one picture. The studio always shows two matching canvases: Arabic on the left, English on the right. The geometry is the same. Names, digits, force labels and units follow each language.",
    )
    pdf.ln(1)
    write(pdf, "Typical pieces you can mix in one drawing:", bold=True, size=10, color=TEAL)
    write(
        pdf,
        "Triangles, quadrilaterals, polygons, circles, 3D solids, axes and graphs, mechanics bodies (particle, block, rod, pulley, ground, incline), free lines and polygons, texts, picture stamps, and saved custom shapes.",
        size=10,
    )
    draw_mini_figures(pdf)
    callout(
        pdf,
        "Always check both canvases",
        "Export writes exactly what you see. Glance at Arabic and English labels before you save the images.",
        GOLD_BG,
        GOLD,
    )

    heading(pdf, "The workspace at a glance", "02")
    write(pdf, "Four areas you will use all the time:")
    write(pdf, "1.  Top bar — studios, file name, Save, Load, Export.", indent=2, size=10)
    write(pdf, "2.  Left sidebar — Setup, Shapes, Constructions.", indent=2, size=10)
    write(pdf, "3.  Centre — tool strip, then the two canvases.", indent=2, size=10)
    write(pdf, "4.  Right inspector — the selected object: size, labels, move / rotate / scale.", indent=2, size=10)
    shot(pdf, "01-workspace.png", "A real drawing: Shapes on the left, Arabic + English in the middle, inspector on the right. Blue handles mean the square is selected.")

    heading(pdf, "Top bar", "03")
    shot(pdf, "05-topbar.png", "File name becomes name_ar / name_en. The green pill is the canvas size in pixels. Export is on the right.")
    write(pdf, "Go to Custom shapes studio — build a reusable figure, then come Back to drawing.", size=10)
    write(pdf, "Go to Picture stamps studio — turn a photo into a shape you can place on the figure.", size=10)
    write(pdf, "Save / Load keep a project. Autosave also remembers the last drawing in this browser.", size=10)
    write(pdf, "CSV batch is for reviewing many figures from a spreadsheet, then exporting a ZIP.", size=10)

    heading(pdf, "The strip above the canvases", "04")
    shot(pdf, "07-toolbar.png", "Select / move is the everyday mode. Green outline means that control is on.")
    keys_row(
        pdf,
        [
            ("Esc", "Select / move — drop the tool and drag shapes or labels"),
            ("Repeat tool", "Keep the same construction after each completed click"),
            ("Fit", "Centre everything and scale it to the image"),
            ("Unlocked", "Drag labels. Switch to Locked so they cannot jump"),
            ("Linked labels", "Arabic and English label positions stay together"),
            ("Large view", "Hide the side panels and enlarge both pictures"),
        ],
    )
    callout(
        pdf,
        "Separate labels",
        "Turn this on only when a letter must sit in a slightly different place in Arabic than in English. The shape itself stays shared.",
    )

    heading(pdf, "Left: Setup, Shapes, Constructions", "05")
    write(pdf, "Three tabs at the top of the left panel. Green fill shows which tab is open.")
    shot(pdf, "02-sidebar.png", "Shapes tab. Pick a family (Triangles, Quadrilaterals, …) then click a tile to place it.")
    write(pdf, "Setup — canvas ratio (3:4, 4:3, 1:1, 16:9) or custom pixels; line weight; label size; italic English letters; Arabic D as ء; looped alif for A.", size=10)
    write(pdf, "Click a placed shape to select it. Drag the body to move. Corner squares scale it. The circle above rotates it.", size=10)
    callout(
        pdf,
        "Shift while transforming",
        "Move: one axis only.  Scale: keep proportions, 5% steps.  Rotate: 15° steps.",
        TEAL_SOFT,
        TEAL,
    )

    heading(pdf, "Arabic and English canvases", "06")
    shot(pdf, "04-canvases.png", "Same square and picture stamp on both sides. Vertex letters are أ ب ج د on Arabic and A B C D on English. Blue dashed box and handles: selected, ready to scale or rotate.")
    write(pdf, "Work on either canvas — clicks apply to the shared figure. Double-click a label to put that one label back on its default spot.", size=10)

    heading(pdf, "Right inspector", "07")
    shot(pdf, "03-inspector.png", "Layers pick the object. For a square: side length, position, rotation, scale, vertex names, right-angle marks, duplicate and delete.")
    write(pdf, "A free polyline also shows Closed polygon, Dashed, Smooth curve, and Vertices (how many corners).", size=10)
    write(pdf, "Delete or Backspace removes the selected shape.", size=10)

    heading(pdf, "Lines you draw yourself", "08")
    shot(pdf, "06-lines.png", "Shapes → Lines. You do not need a shape selected first.")
    write(pdf, "Line — two clicks. On empty canvas this is a free line you can move, rotate and scale. On another body it stays a construction.", size=10)
    write(pdf, "Force — two clicks. Auto puts the arrow in the middle when the force is free, or at the end when it joins two points on the same body. English F, Arabic ق.", size=10)
    write(pdf, "Circular line — two points, then ¼ / ½ / ¾ of a circle.", size=10)
    pdf.ln(1)
    write(pdf, "Free poly line", bold=True, color=TEAL)
    write(
        pdf,
        "Each click adds a vertex and draws the next side immediately. Click near the first point to close a polygon. Press Enter or Finish line when you are done — not double-click. The result is one bulk shape. In the inspector you edit the number of sides, closed/open, dashed, and smooth curve.",
        size=10,
    )

    heading(pdf, "Constructions on a selected shape", "09")
    shot(pdf, "08-constructions.png", "Select the square first. Then Constructions: 9-position anchors, points, segments, perpendiculars, marks.")
    write(pdf, "Follow the yellow hint under the canvases. Repeat tool keeps the same tool after each item.", size=10)
    write(pdf, "Point on side snaps near ¼, ½, ¾. Midpoint marks a side. Shift on a split side marks only the clicked piece.", size=10)
    write(pdf, "Constructions follow the body they belong to. They are not independent free shapes.", size=10)

    heading(pdf, "Texts and math", "10")
    write(pdf, "Shapes → Texts → New text. A bar opens above the canvases. Write Arabic and English yourself — the studio does not translate.")
    callout(
        pdf,
        "Math like the question preview",
        "Wrap TeX in single backticks:  x^2   or   \\frac{\\text{Area}}{5}.  Connected words: \\text{Area}.  Looped alif: \\alef.",
        TEAL_SOFT,
        TEAL,
    )
    write(pdf, "A text object is a free shape: drag, scale, rotate. It has no constructions.", size=10)

    heading(pdf, "Axes, graphs, mechanics", "11")
    write(pdf, "Axes: Spacing is the gap between ticks. Steps is the number written on the first tick after 0, then 2×, 3×. The grid follows those ticks. Tick labels can be π or θ. Curves use those values — with π on X and a tick at ½, sin(x) peaks at ½π. Arabic names: د(س), م(س), ق(س).", size=10)
    write(pdf, "Mechanics (Shapes → Mechanics): particle, block, rod, pulley, ground, incline, wall, hinge. Mix them with geometry. Turn on the 9 anchors when you need extra snap points. A particle on a support sits on the plane; the particle itself is hollow.", size=10)

    heading(pdf, "Pictures, symbols, custom shapes", "12")
    shot(pdf, "09-pictures.png", "Picture stamps studio. Upload a photo, wait for the transparent preview, name it, Add as picture shape, then Insert in drawing.")
    write(pdf, "White exam scans drop the background automatically. Photographs keep the object and cut the rest when the studio shows it is connected. GrabCut refine is optional for photos.", size=10)
    write(pdf, "The placed stamp moves, rotates and scales like any free shape.", size=10)
    write(pdf, "Symbols are ready-made vector stamps from a library (Import). Photos do not go into Symbols.", size=10)
    write(pdf, "Custom shapes studio: draw a figure, name it, Add. Back in the drawing, Shapes → Custom shapes inserts an independent copy.", size=10)

    heading(pdf, "Keyboard and mouse", "13")
    keys_row(
        pdf,
        [
            ("Esc", "Select / move; cancel the current tool"),
            ("Enter", "Finish a free polyline (or click Finish line)"),
            ("Delete", "Remove the selected shape"),
            ("Ctrl+Z", "Undo"),
            ("Ctrl+Y", "Redo  (also Ctrl+Shift+Z)"),
            ("Shift", "While placing a line / force / polyline: snap 0° / 45° / 90° (and parallel to an incline)"),
            ("Shift", "While moving: one axis. While scaling: uniform 5%. While rotating: 15°"),
            ("Double-click", "Reset that label to its default place"),
        ],
    )

    heading(pdf, "Save and export", "14")
    write(pdf, "Save a project file you can Load later. Check both canvases, then Export PNG, SVG, or both. File name becomes name_ar and name_en.")
    write(pdf, "In a CSV batch, review each row, then Export batch ZIP.")
    pdf.ln(4)
    pdf.set_fill_color(*TEAL)
    pdf.rect(pdf.l_margin, pdf.get_y(), pdf.epw, 22, "F")
    pdf.set_text_color(*WHITE)
    pdf.set_font("Ui", "B", 12)
    pdf.set_xy(pdf.l_margin + 6, pdf.get_y() + 4)
    pdf.cell(0, 6, "Quick path")
    pdf.set_font("Ui", "", 10)
    pdf.set_xy(pdf.l_margin + 6, pdf.get_y() + 7)
    pdf.multi_cell(pdf.epw - 12, 5, "Pick a shape  →  construct or label  →  glance at Arabic and English  →  Export.")

    pdf.output(OUT.as_posix())
    print("wrote", OUT, OUT.stat().st_size)


if __name__ == "__main__":
    main()
