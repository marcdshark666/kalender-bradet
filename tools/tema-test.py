"""Uppdrag #369: kontrollerar att tema-regeln håller i alla kombinationer.

Auto ska följa systemet; ett uttryckligt val i Miljö ska slå systemet; och
3D-världen (world.dark) ska alltid vara överens med panelerna (data-tema).
"""
import sys
from playwright.sync_api import sync_playwright

BAS = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:5300"

# (systemläge, val i Miljö, väntat tema)
FALL = [
    ("dark", "auto", "mork"),
    ("light", "auto", "ljus"),
    ("dark", "ljus", "ljus"),
    ("light", "mork", "mork"),
    ("dark", "mork", "mork"),
    ("light", "ljus", "ljus"),
]

fel = 0
with sync_playwright() as p:
    webb = p.chromium.launch(args=["--use-gl=swiftshader", "--enable-unsafe-swiftshader"])
    for schema, val, vantat in FALL:
        ctx = webb.new_context(viewport={"width": 390, "height": 844}, color_scheme=schema)
        sida = ctx.new_page()
        sida.goto(BAS + "/", wait_until="networkidle")
        sida.wait_for_timeout(2000)
        if val != "auto":
            sida.click("#openEnv")
            sida.wait_for_timeout(300)
            sida.click(f'#darkMode button[data-v="{val}"]')
            sida.wait_for_timeout(500)
        tema = sida.evaluate("document.documentElement.dataset.tema")
        varlden = sida.evaluate("KB_APP.world.dark")
        tc = sida.evaluate(
            "[...document.querySelectorAll('meta[name=theme-color]')]"
            ".filter(m => matchMedia(m.media || 'all').matches).map(m => m.content)"
        )
        ok = tema == vantat and varlden == (vantat == "mork") and tc == (
            ["#1d1d2e"] if vantat == "mork" else ["#f1f1ec"])
        if not ok:
            fel += 1
        print(f"{'OK ' if ok else 'FEL'} system={schema:5s} val={val:4s} -> tema={tema:4s} "
              f"world.dark={varlden} theme-color={tc}")
        ctx.close()
    webb.close()

print("\nAlla fall gick igenom." if not fel else f"\n{fel} fall misslyckades.")
sys.exit(1 if fel else 0)
