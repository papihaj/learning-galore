#!/usr/bin/env python3
"""Turn a colored tmux capture into a PNG, for README and PR screenshots.

    tmux capture-pane -e -p -t SESSION > shot.ansi
    python3 scripts/term-shot.py shot.ansi out.png [--cols 111:200] [--rows 1:40]

--cols and --rows crop to a 1-based, inclusive range, so a shot can show only
the Quiz pane. --no-bg drops cell backgrounds, which tmux leaves patchy on a
pane's trailing spaces. Rendering goes through headless Chrome.
"""
import argparse
import html
import os
import re
import subprocess
import sys
import tempfile

CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
FG, BG = '#d7d7d7', '#1c1d21'
BASE16 = ['#1c1d21', '#e06c75', '#98c379', '#e5c07b', '#61afef', '#c678dd', '#56b6c2', '#d7d7d7',
          '#5c6370', '#ff7b86', '#b5e890', '#ffd68a', '#82c4ff', '#de9af0', '#7fd6e0', '#ffffff']


def xterm256(n):
    if n < 16:
        return BASE16[n]
    if n < 232:
        n -= 16
        steps = [0, 95, 135, 175, 215, 255]
        return '#%02x%02x%02x' % (steps[n // 36], steps[(n // 6) % 6], steps[n % 6])
    v = 8 + (n - 232) * 10
    return '#%02x%02x%02x' % (v, v, v)


def parse(line):
    """Split one captured line into cells of (char, style)."""
    cells, style = [], {}
    for part in re.split(r'(\x1b\[[0-9;:]*m)', line):
        if part.startswith('\x1b['):
            codes = [int(c) if c else 0 for c in re.split('[;:]', part[2:-1])] or [0]
            i = 0
            while i < len(codes):
                c = codes[i]
                if c == 0:
                    style = {}
                elif c == 1:
                    style['bold'] = True
                elif c == 2:
                    style['dim'] = True
                elif c == 3:
                    style['italic'] = True
                elif c == 4:
                    style['underline'] = True
                elif c == 7:
                    style['inverse'] = True
                elif c == 22:
                    style.pop('bold', None); style.pop('dim', None)
                elif c == 23:
                    style.pop('italic', None)
                elif c == 24:
                    style.pop('underline', None)
                elif c == 27:
                    style.pop('inverse', None)
                elif c in (38, 48) and i + 1 < len(codes):
                    key = 'fg' if c == 38 else 'bg'
                    if codes[i + 1] == 5 and i + 2 < len(codes):
                        style[key] = xterm256(codes[i + 2]); i += 2
                    elif codes[i + 1] == 2 and i + 4 < len(codes):
                        style[key] = '#%02x%02x%02x' % tuple(codes[i + 2:i + 5]); i += 4
                elif c == 39:
                    style.pop('fg', None)
                elif c == 49:
                    style.pop('bg', None)
                elif 30 <= c <= 37:
                    style['fg'] = BASE16[c - 30]
                elif 90 <= c <= 97:
                    style['fg'] = BASE16[c - 90 + 8]
                elif 40 <= c <= 47:
                    style['bg'] = BASE16[c - 40]
                elif 100 <= c <= 107:
                    style['bg'] = BASE16[c - 100 + 8]
                i += 1
        else:
            for ch in part:
                cells.append((ch, dict(style)))
    return cells


def css(style, keep_bg=True):
    fg, bg = style.get('fg', FG), style.get('bg') if keep_bg else None
    if style.get('inverse'):
        fg, bg = bg or BG, fg
    rules = [f'color:{fg}']
    if bg:
        rules.append(f'background:{bg}')
    if style.get('bold'):
        rules.append('font-weight:700')
    if style.get('dim'):
        rules.append('opacity:.6')
    if style.get('italic'):
        rules.append('font-style:italic')
    if style.get('underline'):
        rules.append('text-decoration:underline')
    return ';'.join(rules)


def crop(spec, size):
    if not spec:
        return 0, size
    a, b = spec.split(':')
    return int(a) - 1, int(b)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src')
    ap.add_argument('out')
    ap.add_argument('--cols')
    ap.add_argument('--rows')
    ap.add_argument('--title', default='')
    ap.add_argument('--no-bg', action='store_true')
    args = ap.parse_args()

    lines = open(args.src, encoding='utf-8', errors='replace').read().split('\n')
    while lines and lines[-1].strip() == '':
        lines.pop()
    r0, r1 = crop(args.rows, len(lines))
    rows = [parse(l) for l in lines[r0:r1]]
    width = max((len(r) for r in rows), default=0)
    c0, c1 = crop(args.cols, width)

    out = []
    for cells in rows:
        cells = cells[c0:c1]
        spans, last, buf = [], None, ''
        for ch, st in cells:
            key = css(st, not args.no_bg)
            if key != last and buf:
                spans.append(f'<span style="{last}">{html.escape(buf)}</span>'); buf = ''
            last = key
            buf += ch
        if buf:
            spans.append(f'<span style="{last}">{html.escape(buf)}</span>')
        out.append(''.join(spans))

    cols = c1 - c0
    char_w, line_h, pad = 8.43, 19, 18
    w = int(cols * char_w + pad * 2) + 2
    h = int(len(out) * line_h + pad * 2 + (34 if args.title else 0))
    bar = (f'<div class="bar"><i></i><i></i><i></i><span>{html.escape(args.title)}</span></div>'
           if args.title else '')
    page = f'''<!doctype html><meta charset="utf-8"><style>
html,body{{margin:0;background:{BG}}}
.bar{{height:34px;display:flex;align-items:center;gap:8px;padding:0 14px;background:#2a2b30;
  font:12px -apple-system,system-ui,sans-serif;color:#9a9ca3}}
.bar i{{width:12px;height:12px;border-radius:50%;background:#55575e}}
.bar span{{margin-left:10px}}
pre{{margin:0;padding:{pad}px;font:14px/{line_h}px Menlo,"SF Mono",monospace;color:{FG};
  white-space:pre;font-variant-ligatures:none}}
</style>{bar}<pre>{chr(10).join(out)}</pre>'''

    with tempfile.NamedTemporaryFile('w', suffix='.html', delete=False, encoding='utf-8') as f:
        f.write(page)
    subprocess.run([CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars',
                    f'--window-size={w},{h}', f'--screenshot={os.path.abspath(args.out)}',
                    f'file://{f.name}'], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    os.unlink(f.name)
    print(args.out, f'{w}x{h}')


if __name__ == '__main__':
    sys.exit(main())
