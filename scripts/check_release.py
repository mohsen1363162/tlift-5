#!/usr/bin/env python3
"""Read-only checks for version consistency and the cPanel build artifact."""
import json
import re
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def check(condition, message):
    if not condition:
        raise SystemExit(f"FAIL: {message}")
    print(f"PASS: {message}")


def main():
    package = json.loads((ROOT / "package.json").read_text())
    lock = json.loads((ROOT / "package-lock.json").read_text())
    version = package["version"]
    app_version = re.search(r'APP_VERSION\s*=\s*"([^"]+)"', (ROOT / "src/utils/appUpdater.ts").read_text())
    check(app_version and app_version.group(1) == version == lock["version"] == lock["packages"][""]["version"], "release versions agree")
    app = (ROOT / "src/App.tsx").read_text()
    check(len(app) > 1000 and "export default" in app and not re.search(r'return\s*<div>\s*</div>', app), "App is not the empty placeholder (static check only)")
    required = {"index.html", ".htaccess", "sw.js", "manifest.webmanifest", "api/sync.php", "api/photos.php", "icons/icon-192.png", "icons/icon-512.png", "data/tlift-bootstrap.json"}
    with zipfile.ZipFile(ROOT / "public/public_html.zip") as archive:
        names = set(archive.namelist())
        check(archive.testzip() is None, "ZIP CRC integrity")
        check(required <= names, "required cPanel files exist")
        check(not any(n.startswith("tests/") for n in names) and
              not any(b"__TLIFT_TEST_ISOLATED__" in archive.read(n) for n in names if n.endswith(".js")),
              "test harness is excluded from production ZIP")
        check(not any(n.lower().endswith((".apk", ".zip", ".tmp")) for n in names), "no APK or nested archives in cPanel ZIP")
        manifests = [json.loads(archive.read(n)) for n in ("manifest.webmanifest",) if n in names]
        manifests.append(json.loads((ROOT / "public/manifest.json").read_text()))
        htaccess = archive.read(".htaccess").decode("utf-8")
        check(all(m.get("start_url") == "/" and m.get("id") == "/asemansara-app-v3" and m.get("display") == "standalone" for m in manifests) and
              "application/manifest+json" in htaccess and "sw\\.js" in htaccess,
              "install files: clean start_url, unchanged app id, manifest MIME and no-cache rules for sw.js/manifest")
        dist = ROOT / "dist"
        expected = {p.relative_to(dist).as_posix() for p in dist.rglob("*") if p.is_file() and not p.name.endswith((".zip", ".tmp"))}
        check(names == expected, "ZIP inventory matches current dist")
        check(all(archive.read(n) == (dist / n).read_bytes() for n in names), "ZIP content matches current dist byte-for-byte")
    print(f"Release {version}: artifact checks passed. Browser and server tests are separate.")


if __name__ == "__main__":
    main()
