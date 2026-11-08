"""Build the offline HTML from source and independently generated demo data."""

import argparse
import base64
import hashlib
import json
import re
from pathlib import Path

from demo_data import demo_records


ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "src"
MODULES = {
    "NOTE_HISTORY": "note-history.js",
    "NOTE_FORMAT": "note-format.js",
    "COMPANY_NOTES": "company-notes.js",
    "STAGE_CHRONOLOGY": "stage-chronology.js",
    "WORKFLOW_RULES": "workflow-rules.js",
    "ABANDONMENT": "abandonment.js",
    "INSIGHTS_JS": "insights.js",
    "IDEAL_COMPANY_INSIGHTS": "ideal-company-insights.js",
    "INSIGHTS_CSS": "insights.css",
}


def render():
    html = (SOURCE / "app.template.html").read_text(encoding="utf-8")
    for name, filename in MODULES.items():
        html = html.replace(f"__{name}__", (SOURCE / filename).read_text(encoding="utf-8"))
    seed = json.dumps(demo_records(), ensure_ascii=False, separators=(",", ":")).replace("<", "\\u003c")
    html = html.replace("__SEED__", seed)
    scripts = re.findall(r"<script>([\s\S]*?)</script>", html)
    if len(scripts) != 1:
        raise ValueError("Expected one executable inline script")
    script_hash = base64.b64encode(hashlib.sha256(scripts[0].encode("utf-8")).digest()).decode("ascii")
    policy = (
        "default-src 'none'; "
        f"script-src 'sha256-{script_hash}'; "
        "style-src 'unsafe-inline'; img-src data:; connect-src 'none'; "
        "base-uri 'none'; form-action 'none'; object-src 'none'"
    )
    html = html.replace("__CONTENT_SECURITY_POLICY__", policy)
    if re.search(r"__[A-Z_]+__", html):
        raise ValueError("A build placeholder was not filled")
    return html


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="check that index.html matches its sources")
    args = parser.parse_args()
    output = ROOT / "index.html"
    rendered = render()
    if args.check:
        if not output.is_file() or output.read_bytes() != rendered.encode("utf-8"):
            raise SystemExit("index.html is stale; run python build.py")
        print("index.html matches the sources")
    else:
        output.write_bytes(rendered.encode("utf-8"))
        print("Built index.html")


if __name__ == "__main__":
    main()
