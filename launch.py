"""Start the farm and its optional private AI service with Python 3."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
from urllib.parse import urlparse, unquote
import webbrowser
from server.advice import AdviceService

ROOT = Path(__file__).resolve().parent


class FarmHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, advice, **kwargs):
        self.advice = advice
        super().__init__(*args, directory=str(ROOT / 'dist'), **kwargs)

    def local_request(self):
        expected = f'127.0.0.1:{self.server.server_port}'
        return self.headers.get('Host') == expected

    def do_GET(self):
        path = unquote(urlparse(self.path).path)
        if not self.local_request() or any(part.startswith('.') for part in path.split('/') if part) or path.startswith('/server/'):
            self.send_error(403)
            return
        if path.startswith('/api/'):
            self.send_error(405)
            return
        super().do_GET()

    def do_HEAD(self):
        path = unquote(urlparse(self.path).path)
        if not self.local_request() or any(part.startswith('.') for part in path.split('/') if part) or path.startswith(('/server/', '/api/')):
            self.send_error(403)
            return
        super().do_HEAD()

    def list_directory(self, path):
        self.send_error(404)
        return None

    def do_POST(self):
        if urlparse(self.path).path != '/api/advice':
            self.reply(404, {'source': 'builtin'})
            return
        expected = f'http://127.0.0.1:{self.server.server_port}'
        if not self.local_request() or self.headers.get('Origin') != expected or self.headers.get_content_type() != 'application/json':
            self.reply(403, {'source': 'builtin'})
            return
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if size <= 0 or size > 12000 or self.headers.get('Transfer-Encoding'):
                self.reply(413, {'source': 'builtin'})
                return
            self.connection.settimeout(7)
            body = json.loads(self.rfile.read(size))
            if not isinstance(body, dict):
                raise ValueError('Invalid body')
            status, result = self.advice.answer(body)
            self.reply(status, result)
        except (ValueError, TypeError, KeyError, TimeoutError):
            self.reply(400, {'source': 'builtin'})

    def reply(self, status, result):
        payload = json.dumps(result).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        try:
            self.wfile.write(payload)
        except (BrokenPipeError, ConnectionResetError):
            pass


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--no-browser', action='store_true')
    parser.add_argument('--port', type=int, default=0)
    args = parser.parse_args()
    service = AdviceService()
    with ThreadingHTTPServer(('127.0.0.1', args.port), partial(FarmHandler, advice=service)) as server:
        url = f'http://127.0.0.1:{server.server_port}'
        print(f'The Last Harvest is running at {url}', flush=True)
        print('Caren: AI enabled with built-in fallback.' if service.settings.get('OPENAI_API_KEY') else 'Caren: built-in tips. No API key needed.', flush=True)
        print('Keep this window open while playing. Press Control-C to stop.', flush=True)
        if not args.no_browser:
            webbrowser.open(url)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print('\nThe valley is closed. See you next harvest.')


if __name__ == '__main__':
    main()
