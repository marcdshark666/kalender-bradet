"""Renderar appen i ljust och mörkt systemläge och sparar skärmbilder.

Kör:  python tools/tema-skott.py <bas-url>
Används för uppdrag #369 för att se att panelerna följer telefonens läge.
"""
import sys
from playwright.sync_api import sync_playwright

BAS = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:5300"
UT = sys.argv[2] if len(sys.argv) > 2 else "tools/skott"

PUMP = "for (let i = 0; i < 300; i++) window.KB_APP && KB_APP.world && KB_APP.world._update(0.05)"


def skjut(sida, namn):
    sida.goto(BAS + "/", wait_until="networkidle")
    sida.wait_for_timeout(2500)
    sida.evaluate(PUMP)
    tema = sida.evaluate("document.documentElement.dataset.tema")
    bg = sida.evaluate("getComputedStyle(document.body).backgroundColor")
    text = sida.evaluate("getComputedStyle(document.body).color")
    sida.screenshot(path=f"{UT}/{namn}-start.png")
    # panelen med flest ytor: Årsstatistik
    sida.click("#openYear")
    sida.wait_for_timeout(700)
    sida.screenshot(path=f"{UT}/{namn}-aret.png")
    sida.click("#yearDrawer [data-close]")
    sida.wait_for_timeout(400)
    # och Miljö, där tema-knapparna sitter
    sida.click("#openEnv")
    sida.wait_for_timeout(700)
    sida.screenshot(path=f"{UT}/{namn}-miljo.png")
    print(f"{namn:14s} data-tema={tema:6s} body-bg={bg:22s} text={text}")
    return tema


with sync_playwright() as p:
    webb = p.chromium.launch(args=["--use-gl=swiftshader", "--enable-unsafe-swiftshader"])
    fel = []
    for namn, schema in (("ljust", "light"), ("morkt", "dark")):
        ctx = webb.new_context(viewport={"width": 390, "height": 844},
                               device_scale_factor=2, color_scheme=schema)
        sida = ctx.new_page()
        sida.on("pageerror", lambda e: fel.append(str(e)))
        tema = skjut(sida, namn)
        vantat = "ljus" if schema == "light" else "mork"
        if tema != vantat:
            print(f"  FEL: väntade data-tema={vantat}, fick {tema}")
        ctx.close()
    webb.close()
    if fel:
        print("JS-fel:", fel[:5])
    else:
        print("Inga JS-fel.")
