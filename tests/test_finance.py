import copy
from datetime import date
import unittest
import finance


class Envelopes(unittest.TestCase):
    def setUp(self):
        self.today = date(2026, 10, 10)
        self.s = finance.initial(self.today)

    def run_action(self, action, **payload):
        return finance.apply(self.s, action, payload, self.today)

    def test_income_funds_current_then_reserve_then_goals(self):
        self.run_action('income', amount=17500000)
        self.run_action('income', amount=20000000)
        self.assertEqual((self.s['balance'], self.s['reserve'], self.s['free']), (17500000, 17500000, 2500000))

    def test_expense_does_not_increase_monthly_funding(self):
        self.run_action('category', name='Машина', limit=1000000)
        self.run_action('income', amount=17500000)
        self.run_action('expense', amount=100000, category=self.s['categories'][0]['id'], tags=['Бензин'])
        self.run_action('income', amount=100000)
        self.assertEqual(self.s['balance'], 17400000)
        self.assertEqual(self.s['reserve'], 100000)
        self.assertEqual(self.s['categories'][0]['tags'], ['Бензин'])

    def test_category_limit_sum_and_unlimited_category(self):
        self.run_action('category', name='Жильё', limit=10000000)
        self.run_action('category', name='Прочее', limit=None)
        with self.assertRaises(ValueError):
            self.run_action('category', name='Еда', limit=8000000)
        self.assertEqual(len(self.s['categories']), 2)

    def test_budget_cannot_be_lower_than_category_limits(self):
        self.run_action('category', name='Жильё', limit=10000000)
        with self.assertRaises(ValueError):
            self.run_action('budget', amount=9000000)

    def test_month_rollover_preserves_unspent_balance(self):
        self.s.update(balance=3000000, reserve=17500000)
        finance.rollover(self.s, date(2026, 11, 1))
        self.assertEqual(self.s['balance'], 17500000)
        self.assertEqual(self.s['reserve'], 3000000)
        snapshot = copy.deepcopy(self.s)
        finance.rollover(self.s, date(2026, 11, 1))
        self.assertEqual(self.s, snapshot)

    def test_multiple_months_do_not_destroy_unspent_money(self):
        self.s.update(balance=17500000, reserve=17500000)
        finance.rollover(self.s, date(2027, 1, 1))
        self.assertEqual(self.s['balance'] + self.s['reserve'], 35000000)

    def test_allocating_requires_one_month_reserve(self):
        self.s.update(balance=17500000, reserve=17499999, free=2500000)
        with self.assertRaises(ValueError):
            self.run_action('allocate', allocations={self.s['goals'][0]['id']:1000000})

    def test_goal_expense_leaves_month_budget_untouched(self):
        self.s.update(balance=17500000, reserve=17500000, free=2500000)
        goal = self.s['goals'][0]
        self.run_action('allocate', allocations={goal['id']:2500000})
        self.run_action('goal_expense', id=goal['id'], amount=1000000)
        self.assertEqual(goal['saved'], 1500000)
        self.assertEqual(self.s['balance'], 17500000)
        with self.assertRaises(ValueError):
            self.run_action('goal_expense', id=goal['id'], amount=1500001)

    def test_goal_initial_savings_do_not_spend_other_funds(self):
        self.run_action('goal', name='Ноутбук', target=20000000, saved=10000000)
        self.assertEqual(self.s['goals'][-1]['saved'],10000000)
        self.assertEqual(self.s['balance'],0)

    def test_budget_changes_reserve_target(self):
        self.s.update(balance=17500000, reserve=17500000)
        self.run_action('budget', amount=15000000)
        self.assertEqual(self.s['reserve'],15000000)
        self.assertEqual(self.s['free'],2500000)
        self.assertEqual(self.s['goals'][0]['target'],15000000)

    def test_fractional_and_negative_amounts_are_rejected(self):
        for value in [-100, True, 0, 12.5, '100']:
            with self.assertRaises(ValueError):
                self.run_action('income',amount=value)

    def test_daily_batch_records_selected_day_and_completion(self):
        self.run_action('category', name='Еда', limit=None)
        category = self.s['categories'][0]['id']
        self.run_action('daily_expenses', date='2026-10-09', entries=[
            dict(category=category,amount=150000,tags=['Кафе']),
            dict(category=category,amount=50000,tags=[]),
        ])
        self.assertEqual(self.s['balance'], -200000)
        self.assertEqual([t['date'] for t in self.s['transactions']], ['2026-10-09']*2)
        self.assertEqual(self.s['checked_days'], ['2026-10-09'])

    def test_day_without_expenses_and_invalid_dates(self):
        self.run_action('daily_expenses', date='2026-10-10', entries=[])
        self.assertEqual(self.s['checked_days'], ['2026-10-10'])
        self.assertEqual(self.s['balance'],0)
        for chosen in ['2026-10-11','2026-09-30']:
            with self.assertRaises(ValueError):
                self.run_action('daily_expenses', date=chosen, entries=[])

    def test_appearance_settings_preserve_each_other(self):
        self.run_action('appearance', icons_only=True)
        self.run_action('appearance', budget_buttons=True)
        self.assertEqual(self.s['appearance'], dict(icons_only=True,budget_buttons=True))
        self.run_action('appearance', budget_buttons=False)
        self.assertTrue(self.s['appearance']['icons_only'])

    def test_extended_icons_are_saved_and_invalid_icon_rejected(self):
        self.run_action('category', name='Транспорт', icon='bus', limit=None)
        self.assertEqual(self.s['categories'][0]['icon'],'bus')
        self.run_action('goal', name='Учёба', icon='education', target=100000)
        self.assertEqual(self.s['goals'][-1]['icon'],'education')
        with self.assertRaises(ValueError):
            finance.icon('<script>')


if __name__ == '__main__':
    unittest.main()
