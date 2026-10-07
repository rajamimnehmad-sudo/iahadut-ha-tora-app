"""Read-only checks for the packaged Android small notification icon."""
import unittest
from pathlib import Path
import xml.etree.ElementTree as ET
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ANDROID = "{http://schemas.android.com/apk/res/android}"

class NotificationIconTest(unittest.TestCase):
    def test_white_transparent_density_masks(self):
        for density, size in {"mdpi": 24, "hdpi": 36, "xhdpi": 48, "xxhdpi": 72, "xxxhdpi": 96}.items():
            with self.subTest(density=density):
                image = Image.open(ROOT / f"android/app/src/main/res/drawable-{density}/ic_notification_logo.png").convert("RGBA")
                self.assertEqual(image.size, (size, size))
                pixels = list(image.getdata())
                self.assertTrue(any(a == 0 for _, _, _, a in pixels))
                # At mdpi antialiased subpixel strokes peak at 234 (92% opacity).
                self.assertTrue(any(a >= 224 for _, _, _, a in pixels))
                self.assertTrue(all((r, g, b) == (255, 255, 255) for r, g, b, a in pixels if a))
                self.assertTrue(all(image.getpixel(point)[3] == 0 for point in [(0, 0),(size-1, 0),(0, size-1),(size-1,size-1)]))
                occupancy = sum(a > 127 for _, _, _, a in pixels) / len(pixels)
                self.assertGreater(occupancy, 0.08)
                self.assertLess(occupancy, 0.65)

    def test_fcm_resource_wiring(self):
        drawable = ET.parse(ROOT / "android/app/src/main/res/drawable/ic_notification.xml").getroot()
        self.assertEqual(drawable.tag, "bitmap")
        self.assertEqual(drawable.attrib[ANDROID + "src"], "@drawable/ic_notification_logo")
        manifest = ET.parse(ROOT / "android/app/src/main/AndroidManifest.xml").getroot()
        metadata = manifest.find("application").findall("meta-data")
        icon = next(m for m in metadata if m.attrib.get(ANDROID + "name") == "com.google.firebase.messaging.default_notification_icon")
        self.assertEqual(icon.attrib[ANDROID + "resource"], "@drawable/ic_notification")
        self.assertIn("icon:'ic_notification'", (ROOT / "scripts/send-manual-push.mjs").read_text())

if __name__ == "__main__":
    unittest.main()
