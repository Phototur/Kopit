"""Build a static Supabase client for GitHub Pages, without a Python backend."""
from pathlib import Path
import shutil
root = Path(__file__).resolve().parent
out = root / 'docs' / 'app'
out.mkdir(parents=True, exist_ok=True)
for name in ['style.css', 'app.js', 'finance-engine.js', 'supabase-api.js', 'supabase-config.js', 'manifest.webmanifest', 'app-icon.png', 'app-icon-512.png', 'brand-icon.svg', 'favicon-32.png', 'favicon.ico', 'apple-touch-icon.png']:
    shutil.copyfile(root / 'web' / name, out / name)
for path in (root / 'web').glob('tutorial-*.png'):
    shutil.copyfile(path, out / path.name)
shutil.copyfile(root / 'web' / 'cloud.html', out / 'index.html')
print('Built docs/app/index.html')
