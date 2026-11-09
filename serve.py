"""Restricted loopback preview. Deploy static assets through an HTTPS host in production."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit, parse_qs
from threading import BoundedSemaphore
import argparse
import os
import stat
import json
from article_reader import ArticleReader

ROOT = Path(__file__).resolve().parent / 'dist'
PUBLIC_FILES = {
    '/': ('index.html', 'text/html; charset=utf-8'),
    '/index.html': ('index.html', 'text/html; charset=utf-8'),
    '/app.js': ('app.js', 'text/javascript; charset=utf-8'),
    '/feed-core.mjs': ('feed-core.mjs', 'text/javascript; charset=utf-8'),
    '/reader.mjs': ('reader.mjs', 'text/javascript; charset=utf-8'),
    '/ui.mjs': ('ui.mjs', 'text/javascript; charset=utf-8'),
    '/style.css': ('style.css', 'text/css; charset=utf-8'),
    '/manifest.json': ('manifest.json', 'application/manifest+json'),
}
CSP = ("default-src 'none'; script-src 'self'; script-src-attr 'none'; style-src 'self'; "
       "connect-src 'self' https://hacker-news.firebaseio.com https://api.spaceflightnewsapi.net "
       "https://earthquake.usgs.gov https://api.crossref.org https://openlibrary.org "
       "https://www.loc.gov https://hn.algolia.com https://www.ebi.ac.uk "
       "https://www.cisa.gov https://raw.githubusercontent.com; "
       "img-src 'self'; font-src 'self'; manifest-src 'self'; "
       "base-uri 'none'; form-action 'none'; object-src 'none'; frame-ancestors 'none'; "
       "require-trusted-types-for 'script'; trusted-types 'none'")


def open_public_file(root, name):
    """Use descriptor-relative, no-follow opens to avoid symlink-check/open races."""
    root_fd = os.open(root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=root_fd)
    finally:
        os.close(root_fd)
    try:
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or info.st_size > 4 * 1024 * 1024:
            raise OSError('Not a public asset')
        return os.fdopen(fd, 'rb')
    except Exception:
        os.close(fd)
        raise


class Handler(BaseHTTPRequestHandler):
    server_version = 'ScrollSmart'
    sys_version = ''
    timeout = 10

    def log_message(self, format, *args):
        # Do not log untrusted paths, queries, headers or terminal escape sequences.
        pass

    def send_error(self, code, message=None, explain=None):
        body = f'{code}\n'.encode('ascii')
        self.send_response(code)
        self.send_header('Content-Type', 'text/plain; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(body)

    def end_headers(self):
        self.send_header('Content-Security-Policy', CSP)
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('X-Frame-Options', 'DENY')
        self.send_header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()')
        self.send_header('Cross-Origin-Resource-Policy', 'same-origin')
        self.send_header('Cross-Origin-Opener-Policy', 'same-origin')
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def serve_asset(self, head=False):
        hosts = self.headers.get_all('Host', [])
        allowed = {f'127.0.0.1:{self.server.server_port}', f'localhost:{self.server.server_port}'}
        if len(hosts) != 1 or hosts[0].lower() not in allowed:
            self.send_error(403)
            return
        origins = self.headers.get_all('Origin', [])
        if (len(origins) > 1 or (origins and origins[0] != 'http://' + hosts[0].lower())
                or self.headers.get('Sec-Fetch-Site', 'none') not in {'none', 'same-origin'}):
            self.send_error(403)
            return
        if self.headers.get('Transfer-Encoding') or self.headers.get('Content-Length', '0') != '0':
            self.send_error(400)
            return
        if not self.path.startswith('/') or self.path.startswith('//') or len(self.path) > 2048:
            self.send_error(404)
            return
        try:
            path = urlsplit(self.path).path
        except ValueError:
            self.send_error(404)
            return
        if path == '/api/reader':
            if head:
                self.send_error(405)
                return
            try:
                query = parse_qs(urlsplit(self.path).query, strict_parsing=True, max_num_fields=1)
                if set(query) != {'id'} or len(query['id']) != 1:
                    raise ValueError('Invalid query')
                value = self.server.article_reader.read(query['id'][0])
            except ValueError:
                self.send_error(400)
                return
            body = json.dumps(value, ensure_ascii=False).encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        asset = PUBLIC_FILES.get(path)
        if not asset:
            self.send_error(404)
            return
        name, mime = asset
        try:
            stream = open_public_file(self.server.public_root, name)
        except OSError:
            self.send_error(404)
            return
        with stream:
            length = os.fstat(stream.fileno()).st_size
            self.send_response(200)
            self.send_header('Content-Type', mime)
            self.send_header('Content-Length', str(length))
            self.end_headers()
            if not head:
                remaining = length
                while remaining:
                    chunk = stream.read(min(65536, remaining))
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    remaining -= len(chunk)

    def do_GET(self):
        self.serve_asset()

    def do_HEAD(self):
        self.serve_asset(head=True)


class PreviewServer(ThreadingHTTPServer):
    daemon_threads = True
    request_queue_size = 16

    def __init__(self, address, root=ROOT):
        self.public_root = root
        self.article_reader = ArticleReader()
        self.slots = BoundedSemaphore(16)
        super().__init__(address, Handler)

    def process_request(self, request, client_address):
        if not self.slots.acquire(blocking=False):
            self.shutdown_request(request)
            return
        try:
            super().process_request(request, client_address)
        except Exception:
            self.slots.release()
            raise

    def process_request_thread(self, request, client_address):
        try:
            super().process_request_thread(request, client_address)
        finally:
            self.slots.release()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8080)
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error('port must be between 1 and 65535')
    try:
        server = PreviewServer(('127.0.0.1', args.port))
    except OSError as exc:
        import errno
        if exc.errno != errno.EADDRINUSE:
            raise
        parser.exit(1, f'Port {args.port} is already in use. Stop the existing server with Ctrl+C '
                       'in its terminal, or run this command with --port followed by a free port '
                       '(for example, --port 8081).\n')
    print(f'Scroll Smart: http://127.0.0.1:{args.port}', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
