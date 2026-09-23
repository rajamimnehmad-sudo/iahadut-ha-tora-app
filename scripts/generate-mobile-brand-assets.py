from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
RES = ROOT / "android" / "app" / "src" / "main" / "res"
LOGO = Image.open(ROOT / "web" / "assets" / "logo-gold-white.png").convert("RGBA")
APP_ICON = Image.open(ROOT / "web" / "assets" / "app-icon-master.png").convert("RGBA")
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


def sharpened_app_icon(size):
    """Resize once from the 1024 px master and retain fine lettering."""
    icon = APP_ICON.resize((size, size), Image.Resampling.LANCZOS)
    if size <= 512:
        icon = icon.filter(ImageFilter.UnsharpMask(radius=max(0.35, size / 640), percent=72, threshold=3))
    return icon


def adaptive_mark():
    """Extract the white seal from the exact green master for adaptive icons."""
    rgb = APP_ICON.convert("RGB")
    luminance = rgb.convert("L")
    # The source is white artwork over #0D7156. Keep antialiased edges while
    # removing the green field, then render the mark as clean neutral white.
    mask = luminance.point(lambda value: max(0, min(255, round((value - 84) * 255 / 158))))
    bounds = mask.getbbox()
    if not bounds:
        raise RuntimeError("No se pudo extraer el isotipo del ícono maestro")
    mark = Image.new("RGBA", rgb.size, WHITE)
    mark.putalpha(mask)
    return mark.crop(bounds)


def launcher(size, round_icon=False):
    image = sharpened_app_icon(size)
    if not round_icon:
        return image
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, size - 1, size - 1), fill=255)
    image.putalpha(mask)
    return image


def adaptive_foreground(size):
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    # Android's adaptive canvas is 108 dp; the central 66 dp is the guaranteed
    # safe zone. 64% keeps the complete seal intact under every OEM mask.
    mark = fit(adaptive_mark(), round(size * 0.64), round(size * 0.64))
    image.alpha_composite(mark, ((size - mark.width) // 2, (size - mark.height) // 2))
    return image


def ios_icon(size=1024):
    return sharpened_app_icon(size).convert("RGB")


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

sharpened_app_icon(192).convert("RGB").save(ROOT / "web" / "public" / "pwa-icon-192.png")
sharpened_app_icon(512).convert("RGB").save(ROOT / "web" / "public" / "pwa-icon-512.png")
sharpened_app_icon(512).convert("RGB").save(ROOT / "app" / "src" / "main" / "res" / "drawable" / "icon.png")

for path in RES.glob("drawable*/splash.png"):
    current = Image.open(path)
    splash(current.size).save(path)

IOS_ICON.parent.mkdir(parents=True, exist_ok=True)
ios_icon().save(IOS_ICON)
