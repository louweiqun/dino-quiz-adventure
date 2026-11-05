# -*- coding: utf-8 -*-
# 重出平板包：整份工程（多文件版）+ 单文件 HTML，和上一版名录一致。
import io, os, zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "dinorpg-tablet.zip")
KEEP = ["index.html", "README.md", "恐龙答题大冒险-单文件.html"]
DIRS = ["css", "js", "vendor", "assets"]

names = []
for f in KEEP:
    p = os.path.join(ROOT, f)
    if os.path.exists(p):
        names.append((f, p))
for d in DIRS:
    for dirpath, _dirs, files in os.walk(os.path.join(ROOT, d)):
        for fn in sorted(files):
            fp = os.path.join(dirpath, fn)
            names.append((os.path.relpath(fp, ROOT).replace("\\", "/"), fp))
names.sort()

with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as z:
    for rel, fp in names:
        z.write(fp, rel)

print("files=%d bytes=%d" % (len(names), os.path.getsize(OUT)))
