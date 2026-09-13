"""Local static preview, bound only to loopback. Stop with Ctrl+C."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from functools import partial
if __name__ == "__main__":
    root = Path(__file__).resolve().parent
    handler = partial(SimpleHTTPRequestHandler, directory=str(root))
    server = ThreadingHTTPServer(("127.0.0.1", 8000), handler)
    print("Open http://127.0.0.1:8000/INDEKS.html — stop with Ctrl+C")
    try: server.serve_forever()
    except KeyboardInterrupt: pass
    finally: server.server_close()
