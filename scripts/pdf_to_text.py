#!/usr/bin/env python3
"""
EOS — pdf_to_text.py

Converts every PDF in docs/ to a plain text file in docs/text/.
Uses PyMuPDF (fitz) which handles large files efficiently page-by-page.

Usage:
    python3 scripts/pdf_to_text.py
"""

import sys
import os
import fitz  # PyMuPDF

DOCS_DIR  = os.path.join(os.path.dirname(__file__), '..', 'docs')
TEXT_DIR  = os.path.join(DOCS_DIR, 'text')

def convert_pdf(pdf_path: str, out_path: str) -> int:
    """Extract text from pdf_path, write to out_path. Returns page count."""
    doc = fitz.open(pdf_path)
    pages = []
    for page in doc:
        text = page.get_text()
        if text.strip():
            pages.append(text)
    doc.close()

    combined = "\n\n".join(pages)
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write(combined)

    return len(pages)


def main():
    os.makedirs(TEXT_DIR, exist_ok=True)

    pdf_files = sorted([
        f for f in os.listdir(DOCS_DIR)
        if f.lower().endswith('.pdf')
    ])

    if not pdf_files:
        print("No PDF files found in docs/")
        sys.exit(0)

    print(f"\n📚  Found {len(pdf_files)} PDF(s) to convert:\n")

    failed = []

    for i, filename in enumerate(pdf_files, 1):
        pdf_path = os.path.join(DOCS_DIR, filename)
        txt_name = os.path.splitext(filename)[0] + '.txt'
        out_path = os.path.join(TEXT_DIR, txt_name)

        mb = os.path.getsize(pdf_path) / 1024 / 1024
        print(f"[{i}/{len(pdf_files)}]  {filename}  ({mb:.1f} MB) ...", end=' ', flush=True)

        try:
            pages = convert_pdf(pdf_path, out_path)
            txt_kb = os.path.getsize(out_path) / 1024
            print(f"✅  {pages} pages → {txt_name} ({txt_kb:.0f} KB)")
        except Exception as e:
            print(f"❌  FAILED: {e}")
            failed.append(filename)

    print(f"\n{'═' * 60}")
    ok = len(pdf_files) - len(failed)
    print(f"✅  Conversion done — {ok} / {len(pdf_files)} files converted.")
    print(f"    Text files saved to: docs/text/")
    if failed:
        print(f"\n⚠️  Failed ({len(failed)}):")
        for f in failed:
            print(f"    • {f}")
    print('═' * 60 + '\n')


if __name__ == '__main__':
    main()
