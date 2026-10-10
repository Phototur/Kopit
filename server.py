"""Kopit: standard-library HTTP server and SQLite persistence."""
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import secrets
import sqlite3
import time
from datetime import datetime
from zoneinfo import ZoneInfo
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit
import finance

ROOT = Path(__file__).parent
DB = Path(os.environ.get('KOPIT_DB', ROOT / 'data' / 'kopit.sqlite3'))
TZ = ZoneInfo(os.environ.get('KOPIT_TIMEZONE', 'Europe/Moscow'))


def connect():
    db = sqlite3.connect(DB, timeout=15)
    db.row_factory = sqlite3.Row
    return db


def init_db():
    DB.parent.mkdir(parents=True, exist_ok=True)
    with connect() as db:
        db.executescript('''
        PRAGMA journal_mode=WAL;
        CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, salt TEXT NOT NULL, password TEXT NOT NULL, state TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS attempts(key TEXT PRIMARY KEY, count INTEGER NOT NULL, reset INTEGER NOT NULL);
        ''')
    os.chmod(DB, 0o600)


def digest(password, salt):
    return hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=16384, r=8, p=1).hex()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        # Do not log request bodies, emails, passwords or cookies.
        pass

    def respond(self, status, obj, cookie=None):
        data = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        if cookie:
            self.send_header('Set-Cookie', cookie)
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def session(self, db):
        try:
            cookies = SimpleCookie(self.headers.get('Cookie', ''))
            token = cookies['kopit_session'].value
        except (KeyError, ValueError):
            return None
        return db.execute('SELECT users.* FROM users JOIN sessions ON users.id=sessions.user_id WHERE sessions.token=? AND sessions.expires>?', (hashlib.sha256(token.encode()).hexdigest(), int(time.time()))).fetchone()

    def do_GET(self):
        path = urlsplit(self.path).path
        if path == '/api/state':
            with connect() as db:
                db.execute('BEGIN IMMEDIATE')
                user = self.session(db)
                if user is None:
                    return self.respond(401, {'error': 'Войдите в аккаунт.'})
                state = json.loads(user['state'])
                revision = user['revision']
                if finance.rollover(state, datetime.now(TZ).date()):
                    revision += 1
                    db.execute('UPDATE users SET state=?, revision=? WHERE id=?', (json.dumps(state), revision, user['id']))
                return self.respond(200, dict(state=state, revision=revision, email=user['email']))
        files = {'/': ('index.html', 'text/html'), '/app.js': ('app.js', 'text/javascript'), '/demo.js': ('demo.js', 'text/javascript'), '/finance-engine.js': ('finance-engine.js', 'text/javascript'), '/style.css': ('style.css', 'text/css')}
        for name in ('setup','budget','categories','reserve','allocation','goals','daily'):
            files[f'/tutorial-{name}.png'] = (f'tutorial-{name}.png', 'image/png')
        if path not in files:
            return self.respond(404, {'error': 'Страница не найдена.'})
        filename, mime = files[path]
        data = (ROOT / 'web' / filename).read_bytes()
        self.send_response(200)
        self.send_header('Content-Type', mime + ('; charset=utf-8' if mime.startswith('text/') else ''))
        self.send_header('Content-Length', str(len(data)))
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'")
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        origin = self.headers.get('Origin')
        if origin and urlsplit(origin).netloc != self.headers.get('Host'):
            return self.respond(403, {'error': 'Недопустимый источник запроса.'})
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 65536:
                raise ValueError('Некорректный размер запроса.')
            p = json.loads(self.rfile.read(length))
            if not isinstance(p, dict):
                raise ValueError('Некорректный запрос.')
            path = urlsplit(self.path).path
            with connect() as db:
                db.execute('BEGIN IMMEDIATE')
                if path in ('/api/register', '/api/login'):
                    email = p.get('email', '').strip().lower()
                    password = p.get('password', '')
                    if not isinstance(password, str) or not 8 <= len(password) <= 200 or not re.fullmatch(r'[^\s@]{1,64}@[^\s@.]+(?:\.[^\s@.]+)+', email) or len(email) > 254:
                        raise ValueError('Укажите почту и пароль длиной от 8 символов.')
                    now = int(time.time())
                    key = hashlib.sha256((self.client_address[0] + email).encode()).hexdigest()
                    attempt = db.execute('SELECT * FROM attempts WHERE key=?', (key,)).fetchone()
                    count = attempt['count'] if attempt and attempt['reset'] > now else 0
                    reset = attempt['reset'] if attempt and attempt['reset'] > now else now + 900
                    if count >= 15:
                        return self.respond(429, {'error': 'Слишком много попыток. Повторите через 15 минут.'})
                    db.execute('INSERT OR REPLACE INTO attempts VALUES (?, ?, ?)', (key, count + 1, reset))
                    user = db.execute('SELECT * FROM users WHERE email=?', (email,)).fetchone()
                    if path == '/api/register':
                        if user:
                            db.commit()
                            return self.respond(400, {'error': 'Этот адрес уже зарегистрирован. Войдите в аккаунт.'})
                        salt = secrets.token_hex(16)
                        db.execute('INSERT INTO users(email,salt,password,state) VALUES (?,?,?,?)', (email, salt, digest(password, salt), json.dumps(finance.initial(datetime.now(TZ).date()))))
                        user = db.execute('SELECT * FROM users WHERE email=?', (email,)).fetchone()
                    elif not hmac.compare_digest(digest(password, user['salt'] if user else '00' * 16), user['password'] if user else '0' * 128):
                        db.commit()
                        return self.respond(401, {'error': 'Почта или пароль неверны.'})
                    token = secrets.token_urlsafe(32)
                    db.execute('DELETE FROM sessions WHERE expires<?', (now,))
                    db.execute('INSERT INTO sessions VALUES (?,?,?)', (hashlib.sha256(token.encode()).hexdigest(), user['id'], now + 2592000))
                    db.execute('DELETE FROM attempts WHERE key=?', (key,))
                    secure = '; Secure' if os.environ.get('KOPIT_SECURE_COOKIE') == '1' else ''
                    return self.respond(200, {'ok': True}, f'kopit_session={token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000{secure}')
                user = self.session(db)
                if user is None:
                    return self.respond(401, {'error': 'Войдите в аккаунт.'})
                if path == '/api/logout':
                    cookie = SimpleCookie(self.headers.get('Cookie', ''))
                    db.execute('DELETE FROM sessions WHERE token=?', (hashlib.sha256(cookie['kopit_session'].value.encode()).hexdigest(),))
                    return self.respond(200, {'ok': True}, 'kopit_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0')
                if path != '/api/action':
                    return self.respond(404, {'error': 'Действие не найдено.'})
                if p.get('revision') != user['revision']:
                    return self.respond(409, {'error': 'Данные изменились на другом устройстве. Обновите страницу и повторите действие.'})
                state = finance.apply(json.loads(user['state']), p.get('action'), p, datetime.now(TZ).date())
                revision = user['revision'] + 1
                db.execute('UPDATE users SET state=?, revision=? WHERE id=?', (json.dumps(state), revision, user['id']))
                return self.respond(200, dict(state=state, revision=revision, email=user['email']))
        except (ValueError, TypeError, AttributeError, KeyError) as e:
            self.respond(400, {'error': str(e) if isinstance(e, ValueError) else 'Проверьте введённые данные.'})
        except Exception:
            self.respond(500, {'error': 'Не удалось сохранить данные. Повторите попытку.'})


if __name__ == '__main__':
    init_db()
    server = ThreadingHTTPServer((os.environ.get('KOPIT_HOST', '127.0.0.1'), int(os.environ.get('PORT', '8000'))), Handler)
    print('Kopit server started', flush=True)
    server.serve_forever()
