import argparse
import base64
import os
import secrets
import sys
import tkinter as tk
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from tkinter import filedialog, ttk

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

VIETNAM = timezone(timedelta(hours=7))
DEFAULT_PRIVATE = Path(os.environ.get("FUNCHOICE_ISSUER_DIR", Path(os.environ["LOCALAPPDATA"]) / "FunChoiceIssuer")) / "pro-signing-private.pem"
SOURCE = Path(__file__).resolve().parent
PUBLIC = (SOURCE / "pro-public.hex") if getattr(sys, "frozen", False) else (SOURCE.parent / "src-tauri" / "pro-public.hex")
BACKGROUND = "#f4f1fa"
INK = "#261c3e"
ACCENT = "#6244c4"


def issue(private_file, end_date=None):
    until = "forever"
    if end_date is not None:
        if end_date < datetime.now(VIETNAM).date():
            raise ValueError("Hãy chọn ngày hết hạn từ hôm nay trở đi.")
        boundary = datetime.combine(end_date + timedelta(days=1), datetime.min.time(), VIETNAM)
        until = str(int(boundary.timestamp()))
    try:
        key = serialization.load_pem_private_key(private_file.read_bytes(), password=None)
    except FileNotFoundError as exc:
        raise ValueError("Chưa tìm thấy tệp khóa ký của SoloTech.") from exc
    except (ValueError, TypeError, OSError) as exc:
        raise ValueError("Không đọc được tệp khóa ký Ed25519.") from exc
    if not isinstance(key, Ed25519PrivateKey):
        raise ValueError("Tệp đã chọn phải là khóa ký Ed25519 của SoloTech.")
    public = key.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)
    if public.hex() != PUBLIC.read_text(encoding="ascii").strip():
        raise ValueError("Khóa ký đã chọn không khớp với bộ cài FunChoice.")
    serial = secrets.token_hex(16)
    payload = f"FunChoice:Pro:v2:{until}:{serial}".encode("ascii")
    signature = base64.urlsafe_b64encode(key.sign(payload)).decode("ascii").rstrip("=")
    return f"FC-PRO2.{until}.{serial}.{signature}"


class KeyMaker(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("FunChoice • Tạo key Pro")
        self.configure(bg=BACKGROUND)
        self.minsize(560, 530)
        self.geometry("620x550")
        if (SOURCE / "solotech.ico").is_file():
            self.iconbitmap(str(SOURCE / "solotech.ico"))
        self.private_file = DEFAULT_PRIVATE
        self.mode = tk.StringVar(value="forever")
        self.end = tk.StringVar(value=(datetime.now(VIETNAM).date() + timedelta(days=30)).isoformat())
        self.key = tk.StringVar()
        self.status = tk.StringVar()
        self.signer = tk.StringVar()
        style = ttk.Style(self)
        style.theme_use("clam")
        style.configure("TFrame", background=BACKGROUND)
        style.configure("TLabel", background=BACKGROUND, foreground=INK, font=("Segoe UI", 10))
        style.configure("Title.TLabel", background=BACKGROUND, foreground=INK, font=("Segoe UI", 25, "bold"))
        style.configure("Note.TLabel", background=BACKGROUND, foreground="#6d607c", font=("Segoe UI", 10))
        style.configure("TRadiobutton", background=BACKGROUND, foreground=INK, font=("Segoe UI", 11))
        style.configure("TButton", padding=(12, 9), font=("Segoe UI", 10))
        style.configure("Accent.TButton", background=ACCENT, foreground="white", font=("Segoe UI", 10, "bold"))
        style.map("Accent.TButton", background=[("active", "#4f32ab")], foreground=[("active", "white")])

        frame = ttk.Frame(self, padding=24)
        frame.pack(fill="both", expand=True)
        ttk.Label(frame, text="FunChoice · Tạo key Pro", style="Title.TLabel").pack(anchor="w")
        ttk.Label(frame, text="Sản phẩm của SoloTech", style="Note.TLabel").pack(anchor="w", pady=(0, 20))
        for text, value in [("Vĩnh viễn", "forever"), ("Có thời hạn", "dated")]:
            ttk.Radiobutton(frame, text=text, value=value, variable=self.mode, command=self.sync_date).pack(anchor="w", pady=2)
        row = ttk.Frame(frame)
        row.pack(fill="x", pady=(8, 12))
        ttk.Label(row, text="Dùng đến hết ngày (giờ Việt Nam)").pack(side="left", padx=(0, 12))
        self.date_input = ttk.Entry(row, width=14, textvariable=self.end)
        self.date_input.pack(side="left")
        ttk.Label(row, text="YYYY-MM-DD", style="Note.TLabel").pack(side="left", padx=8)
        self.sync_date()

        row = ttk.Frame(frame)
        row.pack(fill="x", pady=(3, 12))
        ttk.Button(row, text="Tạo key", style="Accent.TButton", command=self.generate).pack(side="left")
        self.copy_button = ttk.Button(row, text="Sao chép key", command=self.copy_key, state="disabled")
        self.copy_button.pack(side="left", padx=8)
        ttk.Label(frame, text="Key kích hoạt").pack(anchor="w", pady=(0, 4))
        self.output = ttk.Entry(frame, textvariable=self.key, state="readonly", font=("Consolas", 11))
        self.output.pack(fill="x", ipady=6)
        ttk.Label(frame, textvariable=self.status, wraplength=480).pack(anchor="w", pady=(8, 12))
        row = ttk.Frame(frame)
        row.pack(side="bottom", fill="x")
        ttk.Label(row, textvariable=self.signer, style="Note.TLabel").pack(side="left")
        ttk.Button(row, text="Chọn khóa ký…", command=self.choose_signer).pack(side="right")
        self.sync_signer()

    def sync_date(self):
        self.date_input.configure(state="normal" if self.mode.get() == "dated" else "disabled")

    def sync_signer(self):
        self.signer.set("Đã tìm thấy khóa ký SoloTech" if self.private_file.is_file() else "Chưa chọn khóa ký SoloTech")

    def choose_signer(self):
        selected = filedialog.askopenfilename(filetypes=[("Khóa ký PEM", "*.pem"), ("Mọi tệp", "*.*")])
        if selected:
            self.private_file = Path(selected)
            self.sync_signer()

    def generate(self):
        self.key.set("")
        self.copy_button.configure(state="disabled")
        try:
            end_date = None
            if self.mode.get() == "dated":
                try:
                    value = self.end.get().strip()
                    end_date = date.fromisoformat(value)
                    if value != end_date.isoformat() or end_date.year > 9998:
                        raise ValueError()
                except ValueError as exc:
                    raise ValueError("Nhập ngày hết hạn theo dạng YYYY-MM-DD.") from exc
            self.key.set(issue(self.private_file, end_date))
        except (ValueError, OSError) as exc:
            self.status.set(str(exc))
            return
        self.copy_button.configure(state="normal")
        self.status.set("Đã tạo key. Sao chép và gửi key cho người dùng.")
        self.output.focus_set()
        self.output.selection_range(0, "end")

    def copy_key(self):
        self.clipboard_clear()
        self.clipboard_append(self.key.get())
        self.status.set("Đã sao chép key.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--issue", metavar="forever|YYYY-MM-DD")
    args = parser.parse_args()
    if args.issue:
        print(issue(DEFAULT_PRIVATE, None if args.issue == "forever" else date.fromisoformat(args.issue)))
    else:
        KeyMaker().mainloop()
