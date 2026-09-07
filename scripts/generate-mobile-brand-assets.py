from pathlib import Path

from PIL import Image, ImageChops, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
RES = ROOT / "android" / "app" / "src" / "main" / "res"
LOGO = Image.open(ROOT / "web" / "assets" / "logo-gold-white.png").convert("RGBA")
WHITE = (255, 255, 255, 255)
IOS_ICON = ROOT / "ios" / "App" / "App" / "Assets.xcassets" / "AppIcon.appiconset" / "AppIcon-512@2x.png"


def fit(image, width, height):
    copy = image.copy()
    copy.thumbnail((width, height), Image.Resampling.LANCZOS)
    return copy


def logo_bounds():
    rgb = LOGO.convert("RGB")
    white = Image.new("RGB", rgb.size, (255, 255, 255))
    return ImageChops.difference(rgb, white).getbbox()


def logo_art(transparent=False):
    bounds = logo_bounds()
    art = LOGO.crop(bounds) if bounds else LOGO.copy()
    if not transparent:
        return art
    pixels = art.load()
    for y in range(art.height):
        for x in range(art.width):
            r, g, b, a = pixels[x, y]
            alpha = max(0, 255 - min(r, g, b))
            pixels[x, y] = (r, g, b, min(a, alpha))
    return art


def launcher_art(transparent=False):
    # Keep the complete seal, including the surrounding Hebrew and Spanish
    # text, so the installed app icon matches the logo shown in the app header.
    art = logo_art(transparent=transparent)
    if not transparent:
        return art
    pixels = art.load()
    for y in range(art.height):
        for x in range(art.width):
            r, g, b, a = pixels[x, y]
            alpha = max(0, 255 - min(r, g, b))
            pixels[x, y] = (r, g, b, min(a, alpha))
    return art


def launcher(size, round_icon=False):
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0) if round_icon else WHITE)
    draw = ImageDraw.Draw(image)
    if round_icon:
        draw.ellipse((0, 0, size - 1, size - 1), fill=WHITE)
    # Original gold-on-white branding with a generous, even margin.
    mark = fit(launcher_art(), round(size * 0.58), round(size * 0.58))
    image.alpha_composite(mark, ((size - mark.width) // 2, (size - mark.height) // 2))
    return image


def adaptive_foreground(size):
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    mark = fit(launcher_art(transparent=True), round(size * 0.58), round(size * 0.58))
    image.alpha_composite(mark, ((size - mark.width) // 2, (size - mark.height) // 2))
    return image


def ios_icon(size=1024):
    image = Image.new("RGBA", (size, size), WHITE)
    art = fit(logo_art(), round(size * 0.58), round(size * 0.58))
    image.alpha_composite(art, ((size - art.width) // 2, (size - art.height) // 2))
    return image.convert("RGB")


def splash(size):
    width, height = size
    image = Image.new("RGB", size, WHITE[:3])
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

IOS_ICON.parent.mkdir(parents=True, exist_ok=True)
ios_icon().save(IOS_ICON)
