"""Optional browser check: python3 tests/browser_smoke.py (Playwright + Chromium)."""
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import time
import urllib.request
from playwright.sync_api import sync_playwright, expect

root = Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory() as tmp:
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    base = f'http://127.0.0.1:{port}'
    proc = subprocess.Popen(['python3', 'server.py'], cwd=root, env={**os.environ, 'KOPIT_DB':tmp+'/browser.sqlite3', 'PORT':str(port)}, stdout=subprocess.DEVNULL)
    try:
        for _ in range(100):
            try:
                urllib.request.urlopen(base, timeout=.5).close()
                break
            except OSError:
                time.sleep(.05)
        with sync_playwright() as p:
            browser = p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])
            context = browser.new_context(viewport={'width':1280, 'height':1000})
            page = context.new_page()
            errors = []
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.goto(base+'?live=1')
            page.get_by_role('button', name='Первый раз здесь? Создать аккаунт').click()
            page.get_by_label('Электронная почта').fill('browser@example.com')
            page.get_by_label('Пароль', exact=True).fill('browser-test-password')
            page.get_by_role('button', name='Создать аккаунт', exact=True).click()
            expect(page.get_by_role('heading',name='Всё под контролем.')).to_be_visible()
            page.get_by_role('button',name='+ Добавить доход',exact=True).click()
            page.get_by_label('Сумма, ₽',exact=True).fill('375000')
            page.locator('#submit-modal').click()
            expect(page.locator('dialog')).not_to_be_visible()
            page.get_by_role('button',name='Категории',exact=True).click()
            page.get_by_role('button',name='+ Категория').click()
            page.get_by_label('Название',exact=True).fill('Машина')
            page.get_by_label('Месячный лимит, ₽ — необязательно').fill('20000')
            page.locator('#submit-modal').click()
            expect(page.get_by_role('heading',name='Машина')).to_be_visible()
            page.get_by_role('button',name='Обзор',exact=True).click()
            page.get_by_role('button',name='На что потратил').click()
            page.get_by_label('Сумма, ₽',exact=True).fill('500')
            page.get_by_label('Теги через запятую — по желанию').fill('Парковка')
            page.locator('#submit-modal').click()
            expect(page.locator('.hero .big')).to_have_text('174 500 ₽')
            page.get_by_role('button',name='Распределить →',exact=True).click()
            page.get_by_label('Сумма для Ещё один месяц запаса').fill('5000')
            expect(page.locator('#allocation-left')).to_have_text('20 000 ₽')
            page.get_by_label('Сумма для Ещё один месяц запаса').fill('25000')
            expect(page.locator('#allocation-left')).to_have_text('0 ₽')
            page.locator('#submit-modal').click()
            expect(page.locator('dialog')).not_to_be_visible()
            page.screenshot(path='/tmp/kopit-desktop.png',full_page=True)
            page.get_by_role('button',name='Цели',exact=True).click()
            page.get_by_role('button',name='Записать расход',exact=True).click()
            page.get_by_label('Сумма, ₽',exact=True).fill('1000')
            page.locator('#submit-modal').click()
            expect(page.locator('.goals .number')).to_have_text('24 000 ₽')
            page.get_by_role('button',name='Настройки',exact=True).click()
            page.locator('#budget').fill('180000')
            page.get_by_role('button',name='Сохранить бюджет').click()
            expect(page.locator('#budget')).to_have_value('180000')
            page.reload()
            page.get_by_role('button',name='Обзор',exact=True).click()
            expect(page.locator('.hero .big')).to_have_text('174 500 ₽')
            # Independent browser context, same account, same server-side data.
            phone=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True).new_page()
            phone.goto(base+'?live=1')
            phone.get_by_label('Электронная почта').fill('browser@example.com')
            phone.get_by_label('Пароль',exact=True).fill('browser-test-password')
            phone.get_by_role('button',name='Войти',exact=True).click()
            expect(phone.locator('.hero .big')).to_have_text('174 500 ₽')
            phone.screenshot(path='/tmp/kopit-mobile.png',full_page=True)
            assert phone.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Mobile horizontal overflow'
            assert not errors, errors
            browser.close()
            print('Browser checks passed: registration, income, category, tagged expense, slider allocation, goal expense, budget, persistence, second-device login, mobile layout. No JavaScript errors.')
    finally:
        proc.terminate()
        proc.wait(timeout=5)
