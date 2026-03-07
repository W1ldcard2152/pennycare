"""
Statement Extractor — Parses pasted bank/credit card statement text into CSV
using xAI's Grok API, then saves the result for PennyCare import.

Install dependencies:
    pip install requests python-dotenv

Usage:
    python extractor.py
"""

import os
import re
import threading
import tkinter as tk
from datetime import datetime
from pathlib import Path
from tkinter import messagebox, scrolledtext, ttk

import requests
from dotenv import load_dotenv

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parent.parent
UPLOADS_DIR = PROJECT_ROOT / "uploads" / "statements"
ENV_PATH = PROJECT_ROOT / ".env"

XAI_API_URL = "https://api.x.ai/v1/chat/completions"
XAI_MODEL = "grok-4-1-fast-non-reasoning"

EXTRACTION_PROMPT = """You are a financial document extraction tool. The user will paste raw text copied from a bank or credit card statement. Extract ALL individual transactions.

Output ONLY valid CSV with these exact three headers — no markdown, no code fences, no explanations:

Date,Description,Amount

Rules:
- Date: YYYY-MM-DD format. If the year is not shown, assume the current year.
- Description: Transaction description exactly as shown in the statement text. Clean up any extra whitespace but preserve the full text.
- Amount: Positive number only (no dollar signs, no commas, no negative signs). Use the absolute value.

Important:
- Include every individual charge/purchase/debit transaction.
- Do NOT include: payments TO the account (credits/deposits), running balances, interest charges, statement totals, or summary lines.
- Statement text comes in many formats — dates might be MM/DD, Mon DD, etc. Always convert to YYYY-MM-DD.
- If a description contains commas, wrap it in double quotes.
- Output the raw CSV rows immediately after the header line. No other text whatsoever."""


# ---------------------------------------------------------------------------
# API helpers
# ---------------------------------------------------------------------------
def load_api_key() -> str:
    """Load XAI_API_KEY from the project .env file."""
    load_dotenv(ENV_PATH)
    key = os.getenv("XAI_API_KEY", "").strip()
    if not key:
        raise ValueError(
            f"XAI_API_KEY not found in {ENV_PATH}.\n"
            "Add a line like: XAI_API_KEY=xai-your-key-here"
        )
    return key


def extract_transactions(api_key: str, raw_text: str) -> str:
    """Send statement text to Grok and return the parsed CSV."""
    payload = {
        "model": XAI_MODEL,
        "messages": [
            {"role": "system", "content": EXTRACTION_PROMPT},
            {"role": "user", "content": raw_text},
        ],
        "temperature": 0,
    }

    resp = requests.post(
        XAI_API_URL,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json=payload,
        timeout=120,
    )

    if resp.status_code != 200:
        raise RuntimeError(
            f"xAI API returned {resp.status_code}: {resp.text[:500]}"
        )

    data = resp.json()
    content = data["choices"][0]["message"]["content"]

    # Strip markdown code fences if Grok wraps the output
    content = re.sub(r"^```(?:csv)?\s*\n?", "", content, flags=re.MULTILINE)
    content = re.sub(r"\n?```\s*$", "", content, flags=re.MULTILINE)

    return content.strip()


# ---------------------------------------------------------------------------
# CSV helpers
# ---------------------------------------------------------------------------
def validate_csv(text: str) -> tuple[bool, str]:
    """Basic validation that the text looks like valid CSV with expected headers."""
    lines = text.strip().splitlines()
    if len(lines) < 2:
        return False, "CSV has no data rows (only header or empty)"

    header = lines[0].strip().lower()
    if "date" not in header or "amount" not in header:
        return False, f"Header row doesn't look right: {lines[0]}"

    return True, f"{len(lines) - 1} transaction(s) found"


# ---------------------------------------------------------------------------
# GUI Application
# ---------------------------------------------------------------------------
class StatementExtractorApp:
    def __init__(self, root: tk.Tk):
        self.root = root
        self.root.title("PennyCare — Statement Extractor")
        self.root.geometry("900x780")
        self.root.minsize(750, 650)

        self.api_key = ""

        self._build_ui()
        self._load_key()

    def _load_key(self):
        try:
            self.api_key = load_api_key()
            self._set_status("Ready — API key loaded")
        except ValueError as e:
            self._set_status(str(e))
            messagebox.showerror("API Key Error", str(e))

    # ---- UI construction ----
    def _build_ui(self):
        main = ttk.Frame(self.root, padding=16)
        main.pack(fill=tk.BOTH, expand=True)

        # Title
        ttk.Label(
            main, text="Statement Extractor", font=("Segoe UI", 18, "bold")
        ).pack(anchor=tk.W, pady=(0, 4))
        ttk.Label(
            main,
            text="Paste raw statement text below. Grok extracts Date, Description, and Amount into CSV.",
            foreground="gray",
        ).pack(anchor=tk.W, pady=(0, 12))

        # ---- Statement text input ----
        input_frame = ttk.LabelFrame(main, text="Paste Statement Text", padding=4)
        input_frame.pack(fill=tk.BOTH, expand=True, pady=(0, 8))

        self.input_text = scrolledtext.ScrolledText(
            input_frame, wrap=tk.WORD, font=("Consolas", 10), height=10
        )
        self.input_text.pack(fill=tk.BOTH, expand=True)

        # ---- Action buttons ----
        btn_frame = ttk.Frame(main)
        btn_frame.pack(fill=tk.X, pady=(0, 8))

        self.extract_btn = ttk.Button(
            btn_frame, text="Extract Transactions", command=self._start_extraction
        )
        self.extract_btn.pack(side=tk.LEFT)

        self.clear_btn = ttk.Button(
            btn_frame, text="Clear All", command=self._clear_all
        )
        self.clear_btn.pack(side=tk.LEFT, padx=(8, 0))

        self.progress = ttk.Progressbar(btn_frame, mode="indeterminate", length=200)
        self.progress.pack(side=tk.LEFT, padx=(12, 0))

        # ---- CSV output area ----
        csv_frame = ttk.LabelFrame(main, text="Extracted CSV Data (editable)", padding=4)
        csv_frame.pack(fill=tk.BOTH, expand=True, pady=(0, 8))

        self.csv_text = scrolledtext.ScrolledText(
            csv_frame, wrap=tk.NONE, font=("Consolas", 10), height=10
        )
        self.csv_text.pack(fill=tk.BOTH, expand=True)

        # ---- Filename + Save ----
        save_frame = ttk.LabelFrame(main, text="Save", padding=8)
        save_frame.pack(fill=tk.X, pady=(0, 4))

        name_row = ttk.Frame(save_frame)
        name_row.pack(fill=tk.X, pady=(0, 6))

        ttk.Label(name_row, text="Filename:").pack(side=tk.LEFT)
        self.filename_var = tk.StringVar(value="")
        self.filename_entry = ttk.Entry(name_row, textvariable=self.filename_var, width=40)
        self.filename_entry.pack(side=tk.LEFT, padx=(6, 4))
        ttk.Label(name_row, text=".csv", foreground="gray").pack(side=tk.LEFT)

        self.save_btn = ttk.Button(
            name_row, text="Save CSV", command=self._save_csv, state=tk.DISABLED
        )
        self.save_btn.pack(side=tk.RIGHT)

        ttk.Label(
            save_frame,
            text=f"Saves to: {UPLOADS_DIR}",
            foreground="gray",
            font=("Segoe UI", 8),
        ).pack(anchor=tk.W)

        # ---- Status bar ----
        self.status_var = tk.StringVar(value="Loading...")
        ttk.Label(
            main, textvariable=self.status_var, relief=tk.SUNKEN, anchor=tk.W, padding=4
        ).pack(fill=tk.X, side=tk.BOTTOM)

    # ---- Actions ----
    def _clear_all(self):
        self.input_text.delete("1.0", tk.END)
        self.csv_text.delete("1.0", tk.END)
        self.filename_var.set("")
        self.save_btn.config(state=tk.DISABLED)
        self._set_status("Cleared")

    def _start_extraction(self):
        if not self.api_key:
            messagebox.showerror("Error", "No API key loaded. Check your .env file.")
            return

        raw = self.input_text.get("1.0", tk.END).strip()
        if not raw:
            messagebox.showwarning("Empty", "Please paste statement text first.")
            return

        self.extract_btn.config(state=tk.DISABLED)
        self.save_btn.config(state=tk.DISABLED)
        self.csv_text.delete("1.0", tk.END)
        self.progress.start(15)
        self._set_status("Sending to Grok for extraction...")

        thread = threading.Thread(
            target=self._do_extraction, args=(raw,), daemon=True
        )
        thread.start()

    def _do_extraction(self, raw_text: str):
        try:
            csv_data = extract_transactions(self.api_key, raw_text)
            valid, msg = validate_csv(csv_data)
            self.root.after(0, self._extraction_done, csv_data, valid, msg)
        except Exception as e:
            self.root.after(0, self._extraction_error, str(e))

    def _extraction_done(self, csv_data: str, valid: bool, msg: str):
        self.progress.stop()
        self.extract_btn.config(state=tk.NORMAL)

        self.csv_text.delete("1.0", tk.END)
        self.csv_text.insert("1.0", csv_data)

        if valid:
            self.save_btn.config(state=tk.NORMAL)
            self._set_status(f"Extraction complete — {msg}")
        else:
            self._set_status(f"Warning: {msg} — review the output before saving")
            self.save_btn.config(state=tk.NORMAL)

        # Suggest a default filename if the field is empty
        if not self.filename_var.get().strip():
            ts = datetime.now().strftime("%Y%m%d_%H%M%S")
            self.filename_var.set(f"statement_{ts}")

    def _extraction_error(self, error_msg: str):
        self.progress.stop()
        self.extract_btn.config(state=tk.NORMAL)
        self._set_status(f"Error: {error_msg}")
        messagebox.showerror("Extraction Failed", error_msg)

    def _save_csv(self):
        content = self.csv_text.get("1.0", tk.END).strip()
        if not content:
            messagebox.showwarning("Empty", "No CSV data to save.")
            return

        name = self.filename_var.get().strip()
        if not name:
            messagebox.showwarning("No Filename", "Please enter a filename for the CSV.")
            self.filename_entry.focus_set()
            return

        # Sanitize filename — keep only safe characters
        name = re.sub(r'[^\w\-. ]', '_', name)
        if not name.endswith(".csv"):
            name += ".csv"

        UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
        out_path = UPLOADS_DIR / name

        if out_path.exists():
            overwrite = messagebox.askyesno(
                "File Exists",
                f"{name} already exists.\nOverwrite?",
            )
            if not overwrite:
                return

        with open(out_path, "w", newline="", encoding="utf-8") as f:
            f.write(content + "\n")

        self._set_status(f"Saved: {out_path}")
        messagebox.showinfo(
            "Saved",
            f"CSV saved to:\n{out_path}\n\n"
            "Upload this file in PennyCare under\n"
            "Bookkeeping > Upload Statements.",
        )

    def _set_status(self, msg: str):
        self.status_var.set(msg)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    root = tk.Tk()
    StatementExtractorApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()
