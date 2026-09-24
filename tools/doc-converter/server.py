"""
PÖTTYÖS RecipeFlow – local .doc → .docx converter (offline installed version).

Runs ONLY on the local machine (127.0.0.1). Uses a locally installed LibreOffice.
No file ever leaves the computer.

    python server.py            # listens on http://127.0.0.1:8765

Contract: POST /convert with raw .doc bytes → 200 + .docx bytes.
"""
import http.server, subprocess, tempfile, os, shutil

SOFFICE = shutil.which("soffice") or shutil.which("libreoffice") or "soffice"


class H(http.server.BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self.send_response(204); self._cors(); self.end_headers()

    def do_POST(self):
        if self.path != "/convert":
            self.send_response(404); self._cors(); self.end_headers(); return
        data = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        with tempfile.TemporaryDirectory() as d:
            src = os.path.join(d, "in.doc")
            open(src, "wb").write(data)
            subprocess.run([SOFFICE, "--headless", "--convert-to", "docx", "--outdir", d, src],
                           check=False, timeout=120, capture_output=True)
            out = os.path.join(d, "in.docx")
            if not os.path.exists(out):
                self.send_response(422); self._cors(); self.end_headers(); return
            body = open(out, "rb").read()
        self.send_response(200); self._cors()
        self.send_header("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
        self.send_header("Content-Length", str(len(body))); self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    http.server.HTTPServer(("127.0.0.1", 8765), H).serve_forever()
