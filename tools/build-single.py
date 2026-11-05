"""把整款游戏打包成一个可离线双击运行的 HTML：CSS/JS 内联，立绘转成 WebP 后以 data URI 嵌入。"""
import base64, hashlib, io, os, re, sys

from PIL import Image

sys.stdout.reconfigure(encoding="utf-8")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DINOS = os.path.join(ROOT, "assets", "dinos")
OUT = os.path.join(ROOT, "恐龙答题大冒险-单文件.html")
SPRITE_PX = 300
SPRITE_Q = 90
CACHE = os.path.join(ROOT, "tools", ".sprite-cache")

IMG_LINE = 'img: "assets/dinos/dino-" + String(i + 1).padStart(2, "0") + ".png"'
IMG_LINE_NEW = 'img: window.__IMG["dino-" + String(i + 1).padStart(2, "0")]'
BACK_LINE = 'back: "assets/dinos/dino-" + String(i + 1).padStart(2, "0") + "-back.png",'
BACK_LINE_NEW = 'back: window.__IMG["dino-" + String(i + 1).padStart(2, "0") + "-back"],'


def data_uri(path):
    """立绘转 webp 很慢（method=6，50 张要十几分钟），按内容哈希缓存，图没变就直接复用。"""
    st = os.stat(path)
    key = hashlib.sha1(b"%s-%d-%d" % (hashlib.sha1(open(path, "rb").read()).digest(),
                                      st.st_size, int(st.st_mtime))).hexdigest()[:16] + ".txt"
    cp = os.path.join(CACHE, key)
    if os.path.exists(cp):
        with io.open(cp, encoding="utf-8") as fh:
            return fh.read().strip()
    im = Image.open(path).convert("RGBA")
    if max(im.size) > SPRITE_PX:
        im = im.resize((SPRITE_PX, SPRITE_PX), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "WEBP", quality=SPRITE_Q, method=6)
    uri = "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode()
    os.makedirs(CACHE, exist_ok=True)
    with io.open(cp, "w", encoding="utf-8") as fh:
        fh.write(uri)
    return uri


def read(rel):
    with io.open(os.path.join(ROOT, rel.replace("/", os.sep)), encoding="utf-8") as fh:
        return fh.read()


def main():
    uris = {}
    for fn in sorted(os.listdir(DINOS)):
        if fn.lower().endswith(".png"):
            uris[os.path.splitext(fn)[0]] = data_uri(os.path.join(DINOS, fn))
    print("sprites inlined:", len(uris))

    html = read("index.html")

    css = read("css/game.css")
    html, n = re.subn(r'<link [^>]*href="css/game\.css"[^>]*>',
                      lambda m: "<style>\n" + css + "\n</style>", html)
    assert n == 1, "css link not found"

    # str.replace 会换掉全部出现：地图小人和战斗面板各引了一次 hero.png，一处都不能留给兜底逻辑
    html = html.replace('src="assets/dinos/hero.png"', 'src="%s"' % uris["hero"])

    assert 'assets/dinos/hero.png' not in html, "hero.png 没全部换成 data URI"

    prelude = "<script>window.__IMG = " + (
        "{" + ",".join('"%s":"%s"' % (k, v) for k, v in uris.items()) + "}") + ";</script>"

    def inline(m):
        rel = m.group(1)
        body = read(rel)
        if rel.endswith("data.js"):
            assert IMG_LINE in body, "data.js image line changed"
            assert BACK_LINE in body, "data.js back image line changed"
            body = body.replace(IMG_LINE, IMG_LINE_NEW).replace(BACK_LINE, BACK_LINE_NEW)
            return prelude + "\n<script>\n" + body + "\n</script>"
        return "<script>\n" + body + "\n</script>"

    html, n = re.subn(r'<script [^>]*src="([^"]+)"[^>]*></script>', lambda m: inline(m), html)
    print("scripts inlined:", n)

    left = re.findall(r'(?:src|href)="(?!data:)([^"]+)"', html)
    if left:
        raise SystemExit("仍有外部引用未内联: %s" % left)

    with io.open(OUT, "w", encoding="utf-8") as fh:
        fh.write(html)
    print("out=%s bytes=%d (%.1f MB)" % (OUT, os.path.getsize(OUT), os.path.getsize(OUT) / 1048576.0))


if __name__ == "__main__":
    main()
