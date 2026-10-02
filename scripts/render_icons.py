from PyQt6.QtGui import QImage, QPainter, QColor
from PyQt6.QtSvg import QSvgRenderer
from PyQt6.QtCore import QByteArray, QRectF
import os

icons_dir = os.path.join(os.path.dirname(__file__), '../assets/icons')
os.makedirs(icons_dir, exist_ok=True)

# SVG with solid black circle and solid white stylized T
svg_circle_white_t = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="-4.2 -2 617.4 617.4">
  <circle cx="304.5" cy="306.7" r="294" fill="#000000"/>
  <path fill="#ffffff" d="M 128.5 131.2 h 281.7 l 18.3 19.1 h -32.6 v 6.8 h 39.1 l 12.5 13.1 h -99.1 v 6.8 h 105.6 l 11.5 11.9 h -89.8 v 6.8 h 96.3 l 22.1 23 h -145.8 v 129.7 l -87.2 -87.1 v -42.6 h -48.9 z M 261.1 301.5 l 87.2 87.1 v 136.3 l -87.2 -87.3 z"/>
</svg>'''

# SVG for full-bleed / maskable (solid dark background, stylized T in center within 80% safe zone)
svg_maskable = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#000000"/>
  <g transform="translate(256, 256) scale(0.68) translate(-304.5, -306.7)">
    <circle cx="304.5" cy="306.7" r="294" fill="#000000"/>
    <path fill="#ffffff" d="M 128.5 131.2 h 281.7 l 18.3 19.1 h -32.6 v 6.8 h 39.1 l 12.5 13.1 h -99.1 v 6.8 h 105.6 l 11.5 11.9 h -89.8 v 6.8 h 96.3 l 22.1 23 h -145.8 v 129.7 l -87.2 -87.1 v -42.6 h -48.9 z M 261.1 301.5 l 87.2 87.1 v 136.3 l -87.2 -87.3 z"/>
  </g>
</svg>'''

def render_svg(svg_str, out_file, size, bg_color=None):
    renderer = QSvgRenderer(QByteArray(svg_str.encode('utf-8')))
    img = QImage(size, size, QImage.Format.Format_ARGB32_Premultiplied)
    if bg_color:
        img.fill(QColor(bg_color))
    else:
        img.fill(QColor(0, 0, 0, 0)) # transparent
    
    painter = QPainter(img)
    renderer.render(painter, QRectF(0, 0, size, size))
    painter.end()
    
    out_path = os.path.join(icons_dir, out_file)
    img.save(out_path, "PNG")
    print(f"Rendered {out_file} ({size}x{size}) -> {os.path.getsize(out_path)} bytes")

# 1. Any icons (standard transparent outside, black circle, white T)
render_svg(svg_circle_white_t, 'icon-192.png', 192)
render_svg(svg_circle_white_t, 'icon-512.png', 512)

# 2. Maskable icons (for Android adaptive icons: solid black full-bleed with white T in 80% safe zone)
render_svg(svg_maskable, 'icon-maskable-192.png', 192, '#000000')
render_svg(svg_maskable, 'icon-maskable-512.png', 512, '#000000')

# 3. Apple Touch Icon (180x180 solid black with white T for iOS)
render_svg(svg_maskable, 'apple-touch-icon.png', 180, '#000000')

print("All icons successfully generated!")
