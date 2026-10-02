import sys
import os
from PyQt6.QtWidgets import QApplication
from PyQt6.QtGui import QImage, QPainter, QColor
from PyQt6.QtSvg import QSvgRenderer
from PyQt6.QtCore import QByteArray, QRectF

app = QApplication(sys.argv)

icons_dir = os.path.join(os.path.dirname(__file__), '../assets/icons')
os.makedirs(icons_dir, exist_ok=True)

# The original viewBox is "-4.2 -2 617.4 617.4"
# Circle center: (304.5, 306.7), radius: 294
# For maskable: we want the whole design at 80% of canvas
# So we use the same viewBox but expand it to add padding = 20% of 617.4 = ~154 on each side
# New viewBox: -4.2 - 77 = -81.2, -2 - 77 = -79, width = 617.4 + 154 = 771.4, height same

# Standard icon: black circle + white T (transparent outside circle)
svg_standard = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="-4.2 -2 617.4 617.4">
  <circle cx="304.5" cy="306.7" r="294" fill="#000000"/>
  <path fill="#ffffff" d="M 128.5 131.2 h 281.7 l 18.3 19.1 h -32.6 v 6.8 h 39.1 l 12.5 13.1 h -99.1 v 6.8 h 105.6 l 11.5 11.9 h -89.8 v 6.8 h 96.3 l 22.1 23 h -145.8 v 129.7 l -87.2 -87.1 v -42.6 h -48.9 z M 261.1 301.5 l 87.2 87.1 v 136.3 l -87.2 -87.3 z"/>
</svg>"""

# Maskable icon: solid black square bg + same design at 80% (padded viewBox)
svg_maskable = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="-81.2 -79 771.4 771.4">
  <rect x="-81.2" y="-79" width="771.4" height="771.4" fill="#000000"/>
  <circle cx="304.5" cy="306.7" r="294" fill="#000000"/>
  <path fill="#ffffff" d="M 128.5 131.2 h 281.7 l 18.3 19.1 h -32.6 v 6.8 h 39.1 l 12.5 13.1 h -99.1 v 6.8 h 105.6 l 11.5 11.9 h -89.8 v 6.8 h 96.3 l 22.1 23 h -145.8 v 129.7 l -87.2 -87.1 v -42.6 h -48.9 z M 261.1 301.5 l 87.2 87.1 v 136.3 l -87.2 -87.3 z"/>
</svg>"""

def render_svg(svg_str, out_file, size, bg_hex=None):
    renderer = QSvgRenderer(QByteArray(svg_str.encode('utf-8')))
    img = QImage(size, size, QImage.Format.Format_ARGB32_Premultiplied)
    if bg_hex:
        img.fill(QColor(bg_hex))
    else:
        img.fill(QColor(0, 0, 0, 0))
    painter = QPainter(img)
    painter.setRenderHint(QPainter.RenderHint.Antialiasing)
    renderer.render(painter, QRectF(0, 0, size, size))
    painter.end()
    out_path = os.path.join(icons_dir, out_file)
    img.save(out_path, "PNG")
    sz = os.path.getsize(out_path)
    print(f"  {out_file}: {size}x{size}px, {sz} bytes")
    return sz

print("Generating icons...")
render_svg(svg_standard, 'icon-192.png', 192)
render_svg(svg_standard, 'icon-512.png', 512)
render_svg(svg_maskable, 'icon-maskable-192.png', 192, '#000000')
render_svg(svg_maskable, 'icon-maskable-512.png', 512, '#000000')
render_svg(svg_maskable, 'apple-touch-icon.png', 180, '#000000')
print("Done!")

# Validate white pixels exist in maskable
from PIL import Image
for fname in ['icon-maskable-192.png', 'apple-touch-icon.png']:
    pimg = Image.open(os.path.join(icons_dir, fname)).convert('RGB')
    white_pixels = sum(1 for p in pimg.getdata() if p[0] > 200 and p[1] > 200 and p[2] > 200)
    print(f"  {fname}: {white_pixels} white pixels (T shape)")

sys.exit(0)
