from pathlib import Path

from PIL import Image, ImageDraw


SIZE = 512
BACKGROUND = "#244f40"
CREAM = "#fffaf0"
CORAL = "#df7358"

output_dir = Path(__file__).parent / "assets"
output_dir.mkdir(parents=True, exist_ok=True)

image = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
draw = ImageDraw.Draw(image)
draw.rounded_rectangle((20, 20, 492, 492), radius=112, fill=BACKGROUND)
draw.line((135, 267, 221, 351, 381, 170), fill=CREAM, width=58, joint="curve")
draw.ellipse((364, 362, 440, 438), fill=CORAL)

image.save(output_dir / "icon.png")
image.save(
    output_dir / "icon.ico",
    format="ICO",
    sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
)
