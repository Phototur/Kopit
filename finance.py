"""Financial envelopes. All amounts are integer kopecks."""
import calendar
import uuid
from datetime import date


def uid():
    return uuid.uuid4().hex


def initial(today=None):
    today = today or date.today()
    return dict(month=today.strftime('%Y-%m'), budget=17500000, balance=0,
                reserve=0, free=0, categories=[], transactions=[],
                goals=[dict(id=uid(), name='Ещё один месяц запаса', target=17500000,
                            saved=0, reserve=True)],
                reminders=dict(daily='21:00', day=1, enabled=False))


def amount(value, zero=False):
    if isinstance(value, bool) or not isinstance(value, int) or value < (0 if zero else 1) or value > 100000000000:
        raise ValueError('Укажите корректную сумму.')
    return value


def title(value):
    if not isinstance(value, str) or not value.strip() or len(value.strip()) > 60:
        raise ValueError('Название должно содержать от 1 до 60 символов.')
    return value.strip()


def icon(value):
    if value not in ('home','coffee','car','heart','star','sun','plane','laptop','reserve','leaf','groceries','restaurant','water','book','education','phone','wifi','game','music','camera','paint','sport','bike','walk','medical','pet','gift','clothes','shoe','tools','train','bus','boat','bank','wallet','coin','chart','calendar','moon','umbrella'):
        raise ValueError('Выберите пиктограмму из списка.')
    return value


def spent(s):
    return sum(t['amount'] for t in s['transactions'] if t['kind'] == 'expense' and t['date'].startswith(s['month']))


def topup(s):
    needed = max(0, s['budget'] - (s['balance'] + spent(s)))
    transfer = min(s['free'], needed)
    s['balance'] += transfer
    s['free'] -= transfer
    transfer = min(s['free'], max(0, s['budget'] - s['reserve']))
    s['reserve'] += transfer
    s['free'] -= transfer


def rollover(s, today):
    target_month = today.strftime('%Y-%m')
    changed = False
    while s['month'] < target_month:
        year, month = map(int, s['month'].split('-'))
        year, month = (year + 1, 1) if month == 12 else (year, month + 1)
        s['month'] = f'{year:04}-{month:02}'
        excess = max(0, s['balance'] - s['budget'])
        s['balance'] -= excess
        s['free'] += excess
        transfer = min(s['reserve'], max(0, s['budget'] - s['balance']))
        s['reserve'] -= transfer
        s['balance'] += transfer
        topup(s)
        changed = True
    return changed


def find(items, ident):
    item = next((i for i in items if i['id'] == ident), None)
    if item is None:
        raise ValueError('Запись не найдена. Обновите страницу.')
    return item


def apply(s, action, p, today=None):
    today = today or date.today()
    rollover(s, today)
    if action == 'daily_expenses':
        entries = p.get('entries', [])
        if not isinstance(entries, list) or len(entries) > 100:
            raise ValueError('Не больше 100 расходов за один раз.')
        chosen = date.fromisoformat(p.get('date', today.isoformat()))
        if chosen > today or chosen.strftime('%Y-%m') != s['month']:
            raise ValueError('Выберите прошедший день или сегодня в текущем месяце.')
        for entry in entries:
            apply(s, 'expense', {**entry, 'date': chosen.isoformat()}, today)
        if chosen.isoformat() not in s.setdefault('checked_days', []):
            s['checked_days'].append(chosen.isoformat())
    elif action == 'income':
        value = amount(p.get('amount'))
        s['free'] += value
        topup(s)
        s['transactions'].append(dict(id=uid(), kind='income', amount=value, date=today.isoformat()))
    elif action == 'expense':
        value = amount(p.get('amount'))
        chosen = date.fromisoformat(p.get('date', today.isoformat()))
        if chosen > today or chosen.strftime('%Y-%m') != s['month']:
            raise ValueError('Выберите день текущего месяца не позднее сегодня.')
        c = find(s['categories'], p.get('category'))
        tags = p.get('tags', [])
        if not isinstance(tags, list) or len(tags) > 10:
            raise ValueError('Выберите не больше десяти тегов.')
        tags = list(dict.fromkeys(title(t) for t in tags))
        c['tags'] = list(dict.fromkeys(c['tags'] + tags))
        s['balance'] -= value
        s['transactions'].append(dict(id=uid(), kind='expense', amount=value, date=chosen.isoformat(), category=c['id'], category_name=c['name'], tags=tags))
    elif action == 'category':
        limit = p.get('limit')
        if limit is not None:
            limit = amount(limit, zero=True)
        ident = p.get('id')
        if sum(c['limit'] or 0 for c in s['categories'] if c['id'] != ident) + (limit or 0) > s['budget']:
            raise ValueError('Сумма лимитов категорий превышает месячный бюджет.')
        name = title(p.get('name'))
        if ident:
            c = find(s['categories'], ident)
            c.update(name=name, limit=limit)
            if 'icon' in p:
                c['icon'] = icon(p['icon'])
        else:
            s['categories'].append(dict(id=uid(), name=name, limit=limit, tags=[], icon=icon(p.get('icon','star'))))
    elif action == 'budget':
        value = amount(p.get('amount'))
        if sum(c['limit'] or 0 for c in s['categories']) > value:
            raise ValueError('Сначала уменьшите лимиты категорий.')
        s['budget'] = value
        for g in s['goals']:
            if g.get('reserve'):
                g['target'] = value
        excess = max(0, s['reserve'] - value)
        s['reserve'] -= excess
        s['free'] += excess
        topup(s)
    elif action == 'goal':
        name = title(p.get('name'))
        target = amount(p.get('target'))
        if p.get('id'):
            g = find(s['goals'], p['id'])
            g.update(name=name, target=target)
            if 'icon' in p:
                g['icon'] = icon(p['icon'])
        else:
            saved = amount(p.get('saved', 0), zero=True)
            s['goals'].append(dict(id=uid(), name=name, target=target, saved=saved, reserve=False, icon=icon(p.get('icon','star'))))
    elif action == 'goal_order':
        ids = p.get('ids', [])
        if not isinstance(ids, list) or len(ids) != len(s['goals']) or set(ids) != {g['id'] for g in s['goals']}:
            raise ValueError('Некорректный порядок целей.')
        s['goals'] = [find(s['goals'], ident) for ident in ids]
    elif action == 'allocate':
        allocations = p.get('allocations', {})
        if not isinstance(allocations, dict):
            raise ValueError('Некорректное распределение.')
        total = sum(amount(v, zero=True) for v in allocations.values())
        if total > s['free']:
            raise ValueError('Для распределения не хватает денег.')
        if s['reserve'] < s['budget'] or s['balance'] + spent(s) < s['budget']:
            raise ValueError('Сначала обеспечьте текущий и следующий месяц.')
        for ident, value in allocations.items():
            g = find(s['goals'], ident)
            g['saved'] += value
            if value:
                s['transactions'].append(dict(id=uid(), kind='allocation', amount=value, date=today.isoformat(), goal_name=g['name']))
        s['free'] -= total
    elif action == 'goal_expense':
        g = find(s['goals'], p.get('id'))
        value = amount(p.get('amount'))
        if value > g['saved']:
            raise ValueError('В этой цели недостаточно накоплений.')
        g['saved'] -= value
        s['transactions'].append(dict(id=uid(), kind='goal_expense', amount=value, date=today.isoformat(), goal_name=g['name']))
    elif action == 'reminders':
        import re
        daily = p.get('daily', '')
        day = p.get('day')
        if not re.fullmatch(r'(?:[01]\d|2[0-3]):[0-5]\d', daily) or not isinstance(day, int) or not 1 <= day <= 28:
            raise ValueError('Проверьте время и день напоминания.')
        s['reminders'] = dict(daily=daily, day=day, enabled=bool(p.get('enabled')))
    elif action == 'appearance':
        appearance = s.setdefault('appearance', {})
        for key in ('icons_only','budget_buttons'):
            if key in p:
                appearance[key] = bool(p[key])
    else:
        raise ValueError('Неизвестное действие.')
    return s
