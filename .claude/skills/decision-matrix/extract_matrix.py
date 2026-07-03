#!/usr/bin/env python3
"""extract_matrix.py — Extract decision matrices from ruminate.io URLs.

Usage:
    python3 tools/extract_matrix.py <url>              # Fetch and print Markdown table
    curl -sL <url> | python3 tools/extract_matrix.py -  # Pipe HTML from stdin
    python3 tools/extract_matrix.py --help               # Show usage

Output: Formatted Markdown decision matrix with weighted scores.

Requires: pip install beautifulsoup4 lxml (auto-installed on first run)
"""

import sys
import subprocess

try:
    import bs4
except ImportError:
    print("Installing dependencies...", file=sys.stderr)
    subprocess.check_call([sys.executable, "-m", "pip", "install", "beautifulsoup4", "lxml"], stdout=subprocess.DEVNULL)
    import bs4  # noqa

from bs4 import BeautifulSoup
from urllib.request import urlopen


def extract_matrix(html_content: str) -> str:
    """Parse a ruminate.io HTML page and return formatted Markdown."""
    soup = BeautifulSoup(html_content, 'lxml')

    # Extract title from h1
    h1 = soup.find('h1', class_='text-2xl')
    title = h1.get_text(strip=True) if h1 else "Decision Matrix"

    # Find the decision matrix table
    table = soup.find('table', id='decision_matrix')
    if not table:
        print("No decision matrix found on page.", file=sys.stderr)
        return ""

    # Extract option names from header (th cells with class 'option')
    headers = table.find_all('th', class_='option')
    options = [h.get_text(strip=True) for h in headers]
    if not options:
        print("No options found.", file=sys.stderr)
        return ""

    # Parse criterion rows from tbody
    tbody = table.find('tbody')
    criteria_rows = []  # (name, weight_str, scores_list)

    for tr in tbody.find_all('tr'):
        tds = tr.find_all('td')
        if len(tds) < 2 or 'Total Score' in tr.get_text():
            continue  # Skip totals row

        criteria_td = tds[0]
        criterion_div = criteria_td.find('div', class_='flex-grow')
        criterion_name = criterion_div.get_text(strip=True) if criterion_div else "Unknown"

        weight_span = criteria_td.find('span', class_=lambda c: c and 'bg-' in str(c))
        weight_str = weight_span.get_text(strip=True) if weight_span else "1x"

        scores = [td.get('data-value', '0') for td in tds[1:]]
        criteria_rows.append((criterion_name, weight_str, scores))

    # Calculate weighted totals per option
    n_options = len(options)
    totals = [0.0] * n_options

    for _, weight_str, scores in criteria_rows:
        multiplier = float(weight_str.replace('x', '')) if 'x' in weight_str else 1.0
        for i, score in enumerate(scores):
            totals[i] += float(score) * multiplier

    # Build Markdown output
    lines = []
    lines.append(f"# {title}\n")
    lines.append("| Criterion | Weight | " + " | ".join(options) + " |")
    lines.append("|-----------|--------|" + "---" * len(options) + "|")

    for name, weight_str, scores in criteria_rows:
        score_parts = [s.ljust(2) for s in scores]
        lines.append(f"| {name} | {weight_str} | " + " | ".join(score_parts) + " |")

    # Totals row
    totals_str = " | ".join(f"{t:.1f}" for t in totals)
    lines.append("| **Total** | | " + totals_str + " |")

    return "\n".join(lines)


def main():
    if len(sys.argv) < 2:
        print("Usage:", file=sys.stderr)
        print("  python3 tools/extract_matrix.py <url>", file=sys.stderr)
        print("  curl -sL <url> | python3 tools/extract_matrix.py -", file=sys.stderr)
        sys.exit(1)

    input_arg = sys.argv[1]
    if input_arg == '-':
        html_content = sys.stdin.read()
    else:
        resp = urlopen(input_arg, timeout=30)
        html_content = resp.read().decode('utf-8')

    result = extract_matrix(html_content)
    print(result)


if __name__ == '__main__':
    main()
