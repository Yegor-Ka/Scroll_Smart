"""Exercise real HTTP parsing and response generation with an in-memory socket."""
import importlib.util
import io
import os
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))

spec = importlib.util.spec_from_file_location('preview', Path(__file__).resolve().parents[1] / 'serve.py')
preview = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preview)

class Socket:
    def __init__(self, raw):
        self.input = io.BytesIO(raw)
        self.output = bytearray()
    def makefile(self, *args):
        return self.input
    def sendall(self, data):
        self.output.extend(data)
    def settimeout(self, value):
        pass

class ServerSecurityTests(unittest.TestCase):
    def request(self, path='/', method='GET', headers=None, root=None):
        headers = ['Host: 127.0.0.1:8080'] if headers is None else headers
        raw = (f'{method} {path} HTTP/1.1\r\n' + '\r\n'.join(headers) + '\r\n\r\n').encode()
        sock = Socket(raw)
        preview.Handler(sock, ('127.0.0.1', 12345), SimpleNamespace(server_port=8080, public_root=root or preview.ROOT))
        head, body = bytes(sock.output).split(b'\r\n\r\n', 1)
        lines = head.decode().split('\r\n')
        return int(lines[0].split()[1]), dict(line.split(': ', 1) for line in lines[1:]), body

    def test_all_public_assets_and_security_headers(self):
        for path in preview.PUBLIC_FILES:
            with self.subTest(path=path):
                status, headers, body = self.request(path)
                self.assertEqual(status, 200)
                self.assertEqual(len(body), int(headers['Content-Length']))
                self.assertEqual(headers['X-Content-Type-Options'], 'nosniff')
                self.assertEqual(headers['Cross-Origin-Resource-Policy'], 'same-origin')
                self.assertIn("require-trusted-types-for 'script'", headers['Content-Security-Policy'])
                self.assertNotIn('Python', headers['Server'])
                status, _, body = self.request(path, method='HEAD')
                self.assertEqual(status, 200)
                self.assertEqual(body, b'')

    def test_host_origin_and_cross_site_rejection(self):
        for headers in [[], ['Host: evil.test:8080'], ['Host: localhost.evil.test:8080'],
                        ['Host: localhost:8080', 'Host: 127.0.0.1:8080'],
                        ['Host: localhost:8080', 'Origin: https://evil.test'],
                        ['Host: localhost:8080', 'Origin: null'],
                        ['Host: localhost:8080', 'Sec-Fetch-Site: cross-site'],
                        ['Host: localhost:8080', 'Sec-Fetch-Site: same-site']]:
            with self.subTest(headers=headers):
                self.assertEqual(self.request(headers=headers)[0], 403)
        self.assertEqual(self.request(headers=['Host: localhost:8080', 'Origin: http://localhost:8080', 'Sec-Fetch-Site: same-origin'])[0], 200)

    def test_private_paths_and_traversal(self):
        for path in ['/../serve.py', '/%2e%2e/serve.py', '/app.js/../serve.py', '/.git/config',
                     '/.env', '/_headers', '/README.md', '//evil.test/', '/style.css%00',
                     '/%61pp.js', 'http://evil.test/', '/x' + 'a'*2100]:
            with self.subTest(path=path):
                status, headers, _ = self.request(path)
                self.assertEqual(status, 404)
                self.assertIn('Content-Security-Policy', headers)

    def test_methods_and_body_rejected(self):
        for method in ['POST', 'PUT', 'DELETE', 'OPTIONS', 'TRACE']:
            self.assertEqual(self.request(method=method)[0], 501)
        self.assertEqual(self.request(headers=['Host: localhost:8080', 'Content-Length: 1'])[0], 400)
        self.assertEqual(self.request(headers=['Host: localhost:8080', 'Transfer-Encoding: chunked'])[0], 400)

    def test_ambiguous_request_headers_are_rejected(self):
        for extra in [
            ['Content-Length: 0', 'Content-Length: 1'],
            ['Content-Length: 0', 'Content-Length: 0'],
            ['Transfer-Encoding:'],
            ['Transfer-Encoding:', 'Transfer-Encoding: chunked'],
        ]:
            with self.subTest(headers=extra):
                status, headers, _ = self.request(headers=['Host: localhost:8080'] + extra)
                self.assertEqual(status, 400)
                self.assertEqual(headers.get('Connection'), 'close')
        self.assertEqual(self.request(headers=['Host: localhost:8080',
            'Sec-Fetch-Site: same-origin', 'Sec-Fetch-Site: cross-site'])[0], 403)

    def test_symlinks_hardlinks_and_extra_files_are_not_served(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root/'secret').write_text('private')
            (root/'index.html').symlink_to(root/'secret')
            self.assertEqual(self.request(root=root)[0], 404)
            (root/'index.html').unlink()
            os.link(root/'secret', root/'index.html')
            self.assertEqual(self.request(root=root)[0], 404)
            self.assertEqual(self.request('/secret', root=root)[0], 404)
            (root/'index.html').unlink()
            (root/'index.html').mkdir()
            self.assertEqual(self.request(root=root)[0], 404)

    def test_headers_are_consistent(self):
        root = Path(__file__).resolve().parents[1]
        deployed = (root/'dist/_headers').read_text()
        self.assertIn('Content-Security-Policy: ' + preview.CSP, deployed)

if __name__ == '__main__':
    unittest.main()
