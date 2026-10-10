import http.cookiejar
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time
import unittest
import urllib.error
import urllib.request
import socket


class ServerFlow(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.db = str(Path(cls.tmp.name)/'test.sqlite3')
        with socket.socket() as sock:
            sock.bind(('127.0.0.1',0))
            cls.port = sock.getsockname()[1]
        cls.base = f'http://127.0.0.1:{cls.port}'
        cls.proc = subprocess.Popen(['python3','server.py'], env={**os.environ,'KOPIT_DB':cls.db,'PORT':str(cls.port)}, stdout=subprocess.DEVNULL)
        for _ in range(100):
            try:
                urllib.request.urlopen(cls.base,timeout=.5).close()
                break
            except OSError:
                time.sleep(.05)
        else:
            cls.proc.terminate()
            raise RuntimeError('Server did not start')

    @classmethod
    def tearDownClass(cls):
        cls.proc.terminate()
        cls.proc.wait(timeout=5)
        cls.tmp.cleanup()

    def client(self):
        return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))

    def request(self, client, path, body=None, origin=None):
        req = urllib.request.Request(self.base+'/api/'+path, data=json.dumps(body).encode() if body is not None else None, headers={'Content-Type':'application/json',**({'Origin':origin} if origin else {})})
        try:
            with client.open(req,timeout=5) as r:
                return r.status,json.load(r)
        except urllib.error.HTTPError as e:
            return e.code,json.load(e)

    def test_complete_account_flow_and_sync(self):
        a,b=self.client(),self.client()
        self.assertEqual(self.request(a,'state')[0],401)
        self.assertEqual(self.request(a,'register',dict(email='test@example.com',password='test-password-42'))[0],200)
        code,data=self.request(a,'state')
        self.assertEqual(code,200)
        self.assertEqual(data['state']['budget'],17500000)
        self.assertEqual(self.request(a,'action',dict(action='income',amount=37500000,revision=data['revision']))[0],200)
        self.assertEqual(self.request(b,'login',dict(email='test@example.com',password='test-password-42'))[0],200)
        synced=self.request(b,'state')[1]
        self.assertEqual(synced['state']['free'],2500000)
        # A stale device must not silently overwrite newer data.
        self.assertEqual(self.request(a,'action',dict(action='income',amount=100,revision=data['revision']))[0],409)
        # Failed allocation is atomic.
        before=synced['state']
        goal=before['goals'][0]['id']
        self.assertEqual(self.request(b,'action',dict(action='allocate',allocations={goal:2500001},revision=synced['revision']))[0],400)
        self.assertEqual(self.request(b,'state')[1]['state'],before)
        self.assertEqual(self.request(b,'action',dict(action='allocate',allocations={goal:2500000},revision=synced['revision']))[0],200)
        self.assertEqual(self.request(a,'state')[1]['state']['goals'][0]['saved'],2500000)
        self.assertEqual(self.request(a,'logout',{})[0],200)
        self.assertEqual(self.request(a,'state')[0],401)

    def test_accounts_are_isolated_and_cross_origin_requests_rejected(self):
        a,b=self.client(),self.client()
        for client,email in [(a,'one@example.com'),(b,'two@example.com')]:
            self.assertEqual(self.request(client,'register',dict(email=email,password='different-password'))[0],200)
        revision=self.request(a,'state')[1]['revision']
        self.request(a,'action',dict(action='income',amount=10000,revision=revision))
        self.assertEqual(self.request(b,'state')[1]['state']['balance'],0)
        self.assertEqual(self.request(a,'action',dict(action='income',amount=10000,revision=revision+1),origin='https://other.example')[0],403)
        self.assertEqual(self.request(b,'login',dict(email='two@example.com',password='incorrect-password'))[0],401)

    def test_daily_batch_is_atomic(self):
        a=self.client()
        self.request(a,'register',dict(email='daily@example.com',password='daily-test-password'))
        data=self.request(a,'state')[1]
        data=self.request(a,'action',dict(action='category',name='Еда',limit=None,revision=data['revision']))[1]
        before=data['state']
        category=before['categories'][0]['id']
        from datetime import datetime
        from zoneinfo import ZoneInfo
        today=datetime.now(ZoneInfo('Europe/Moscow')).date().isoformat()
        code,_=self.request(a,'action',dict(action='daily_expenses',date=today,revision=data['revision'],entries=[dict(category=category,amount=10000,tags=[]),dict(category='missing',amount=10000,tags=[])]))
        self.assertEqual(code,400)
        self.assertEqual(self.request(a,'state')[1]['state'],before)


if __name__ == '__main__':
    unittest.main()
