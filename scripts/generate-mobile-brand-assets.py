from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance


ROOT = Path(__file__).resolve().parents[1]
RES = ROOT / "android" / "app" / "src" / "main" / "res"
LOGO = Image.open(ROOT / "web" / "assets" / "logo.png").convert("RGBA")
GREEN = (31, 93, 70, 255)
CREAM = (250, 249, 246, 255)


def fit(image, width, height):
    copy = image.copy()
    copy.thumbnail((width, height), Image.Resampling.LANCZOS)
    return copy


def hebrew_mark():
    mark = LOGO.crop((62, 54, 258, 204)).convert("RGBA")
    mark = ImageEnhance.Contrast(mark).enhance(1.2)
    pixels = mark.load()
    for y in range(mark.height):
        for x in range(mark.width):
            r, g, b, a = pixels[x, y]
            if r > 238 and g > 238 and b > 238:
                pixels[x, y] = (255, 255, 255, 0)
            else:
                pixels[x, y] = (r, g, b, a)
    return mark


def launcher(size, round_icon=False):
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0) if round_icon else GREEN)
    draw = ImageDraw.Draw(image)
    if round_icon:
        draw.ellipse((0, 0, size - 1, size - 1), fill=GREEN)
    inset = round(size * 0.16)
    radius = round(size * 0.16)
    draw.rounded_rectangle((inset, inset, size - inset, size - inset), radius=radius, fill=CREAM)
    mark = fit(hebrew_mark(), round(size * 0.56), round(size * 0.48))
    image.alpha_composite(mark, ((size - mark.width) // 2, (size - mark.height) // 2))
    return image


def adaptive_foreground(size):
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    inset = round(size * 0.25)
    draw.rounded_rectangle((inset, inset, size - inset, size - inset), radius=round(size * 0.1), fill=CREAM)
    mark = fit(hebrew_mark(), round(size * 0.40), round(size * 0.34))
    image.alpha_composite(mark, ((size - mark.width) // 2, (size - mark.height) // 2))
    return image


def splash(size):
    width, height = size
    image = Image.new("RGB", size, CREAM[:3])
    logo = fit(LOGO, round(width * (0.52 if width <= height else 0.30)), round(height * 0.28))
    image.paste(logo.convert("RGB"), ((width - logo.width) // 2, (height - logo.height) // 2))
    return image


for density, icon_size, foreground_size in [
    ("mdpi", 48, 108),
    ("hdpi", 72, 162),
    ("xhdpi", 96, 216),
    ("xxhdpi", 144, 324),
    ("xxxhdpi", 192, 432),
]:
    folder = RES / f"mipmap-{density}"
    launcher(icon_size).save(folder / "ic_launcher.png")
    launcher(icon_size, round_icon=True).save(folder / "ic_launcher_round.png")
    adaptive_foreground(foreground_size).save(folder / "ic_launcher_foreground.png")

for path in RES.glob("drawable*/splash.png"):
    current = Image.open(path)
    splash(current.size).save(path)

