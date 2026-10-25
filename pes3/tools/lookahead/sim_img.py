# Writes <name>-deutan.png: a screenshot as seen with deuteranopia (Machado 2009). Needs Pillow + numpy.
# Run: python3 tools/lookahead/sim_img.py shot1.png shot2.png
import sys, numpy as np
from PIL import Image
D = np.array([[0.367322,0.860646,-0.227968],[0.280085,0.672501,0.047413],[-0.011820,0.042940,0.968881]])  # Machado 2009 deuteranopia
for src in sys.argv[1:]:
    a = np.asarray(Image.open(src).convert("RGB")).astype(float) / 255
    lin = np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4)
    out = np.clip(lin @ D.T, 0, 1)
    srgb = np.where(out <= 0.0031308, out * 12.92, 1.055 * out ** (1 / 2.4) - 0.055)
    Image.fromarray((srgb * 255).round().astype("uint8")).save(src.replace(".png", "-deutan.png"))
