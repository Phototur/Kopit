"""Build a standalone, offline demo without dependencies or data persistence."""
from pathlib import Path
import base64
import re

root = Path(__file__).parent
web = root / 'web'
html = (web / 'index.html').read_text()
html = html.replace('<link rel="stylesheet" href="./style.css">', '<style>' + (web / 'style.css').read_text() + '</style>')
html = html.replace('<script src="./finance-engine.js" defer></script><script src="./demo.js" defer></script><script src="./app.js" defer></script>', '')
scripts = (web / 'finance-engine.js').read_text() + '\n' + (web / 'demo.js').read_text() + '\n' + (web / 'app.js').read_text()
html = html.replace('</body>', '<script>\n' + scripts + '\n</script></body>')
html = html.replace('href="/"', 'href=""')
html = re.sub(r'\./(tutorial-[a-z]+\.png)', lambda m: 'data:image/png;base64,' + base64.b64encode((web / m[1]).read_bytes()).decode(), html)
html = re.sub(r"image:'(tutorial-[a-z]+\.png)'", lambda m: "image:'data:image/png;base64," + base64.b64encode((web / m[1]).read_bytes()).decode() + "'", html)
(root / 'kopit-demo.html').write_text(html)
pages = root / 'docs'
pages.mkdir(exist_ok=True)
(pages / 'index.html').write_text(html.replace("window.KOPIT_DEMO = new URLSearchParams(location.search).get('live') !== '1';", 'window.KOPIT_DEMO = true;'))
(pages / '.nojekyll').touch()
print('Created kopit-demo.html and docs/index.html')
