"""A small local form for creating and publishing life entries on Windows."""

from datetime import date
import json
from pathlib import Path
import subprocess
import tkinter as tk
from tkinter import filedialog, messagebox, scrolledtext, simpledialog, ttk

from scripts.new_life import ROOT, write_entry


DRAFT = ROOT / "drafts" / "life-form.json"


def git(*args):
    result = subprocess.run(
        ["git", *args], cwd=ROOT, capture_output=True, text=True,
        encoding="utf-8", errors="replace", check=False,
    )
    if result.returncode:
        raise RuntimeError((result.stderr or result.stdout).strip() or "Git 操作失败")
    return result.stdout.strip()


def check_publish_ready():
    if git("branch", "--show-current") != "main":
        raise RuntimeError("当前不在 main 分支。请先合并并同步项目，再从 main 发布。")
    if git("diff", "--cached", "--name-only"):
        raise RuntimeError("暂存区已有其他改动，请先处理这些改动，以免一起提交。")
    git("fetch", "origin", "main")
    if git("rev-parse", "HEAD") != git("rev-parse", "origin/main"):
        raise RuntimeError("本地 main 与 GitHub 不一致，请先同步项目。")


def publish_files(output, images, title):
    paths = [str(path.relative_to(ROOT)) for path in [output, *images]]
    git("add", "--", *paths)
    git("commit", "-m", f"Add life entry: {title}")
    git("push", "origin", "main")


class LifeEditor:
    def __init__(self, window):
        self.window = window
        self.photos = []
        window.title("生活记录编辑器")
        window.geometry("800x720")
        window.minsize(650, 600)
        frame = ttk.Frame(window, padding=16)
        frame.pack(fill="both", expand=True)
        frame.columnconfigure(1, weight=1)
        frame.rowconfigure(4, weight=1)
        frame.rowconfigure(6, weight=1)

        self.title = tk.StringVar()
        self.day = tk.StringVar(value=date.today().isoformat())
        self.description = tk.StringVar()
        for row, label, variable in (
            (0, "标题 *", self.title),
            (1, "日期 *", self.day),
            (2, "一句简介", self.description),
        ):
            ttk.Label(frame, text=label).grid(row=row, column=0, sticky="w", pady=5)
            ttk.Entry(frame, textvariable=variable).grid(
                row=row, column=1, sticky="ew", padx=(12, 0), pady=5,
            )

        ttk.Label(frame, text="正文（支持 Markdown）").grid(row=3, column=0, columnspan=2, sticky="w", pady=(12, 4))
        self.body = scrolledtext.ScrolledText(frame, height=10, wrap="word")
        self.body.grid(row=4, column=0, columnspan=2, sticky="nsew")

        ttk.Label(frame, text="照片（本地文件和 OSS 直链可混用）").grid(
            row=5, column=0, columnspan=2, sticky="w", pady=(12, 4),
        )
        self.photo_list = ttk.Treeview(frame, columns=("source", "alt"), show="headings", height=6)
        self.photo_list.heading("source", text="照片来源")
        self.photo_list.heading("alt", text="图片描述")
        self.photo_list.column("source", width=480)
        self.photo_list.column("alt", width=220)
        self.photo_list.grid(row=6, column=0, columnspan=2, sticky="nsew")

        buttons = ttk.Frame(frame)
        buttons.grid(row=7, column=0, columnspan=2, sticky="w", pady=8)
        ttk.Button(buttons, text="选择本地照片", command=self.add_local).pack(side="left", padx=(0, 8))
        ttk.Button(buttons, text="添加 OSS 链接", command=self.add_oss).pack(side="left", padx=(0, 8))
        ttk.Button(buttons, text="修改图片描述", command=self.edit_alt).pack(side="left", padx=(0, 8))
        ttk.Button(buttons, text="移除选中", command=self.remove_photo).pack(side="left")

        actions = ttk.Frame(frame)
        actions.grid(row=8, column=0, columnspan=2, sticky="ew", pady=(16, 0))
        ttk.Button(actions, text="生成文件", command=lambda: self.submit(False)).pack(side="left")
        ttk.Button(actions, text="发布到网站", command=lambda: self.submit(True)).pack(side="right")
        ttk.Label(frame, text="发布会提交本条记录并推送 main；网站由 GitHub Actions 构建。", foreground="#555").grid(
            row=9, column=0, columnspan=2, sticky="w", pady=(8, 0),
        )
        self.load_draft()
        window.protocol("WM_DELETE_WINDOW", self.close)

    def refresh_photos(self):
        for item in self.photo_list.get_children():
            self.photo_list.delete(item)
        for index, photo in enumerate(self.photos):
            self.photo_list.insert("", "end", iid=str(index), values=(photo["source"], photo["alt"]))

    def add_local(self):
        paths = filedialog.askopenfilenames(
            parent=self.window, title="选择照片",
            filetypes=[("图片", "*.jpg *.jpeg *.png *.webp *.gif *.avif"), ("所有文件", "*.*")],
        )
        for path in paths:
            self.photos.append({"source": path, "alt": Path(path).stem})
        self.refresh_photos()

    def add_oss(self):
        url = simpledialog.askstring("OSS 图片", "粘贴公开的 HTTPS 图片直链：", parent=self.window)
        if url:
            self.photos.append({"source": url.strip(), "alt": ""})
            self.refresh_photos()

    def selected_index(self):
        selected = self.photo_list.selection()
        return int(selected[0]) if selected else None

    def edit_alt(self):
        index = self.selected_index()
        if index is None:
            return
        alt = simpledialog.askstring(
            "图片描述", "输入图片描述：", initialvalue=self.photos[index]["alt"], parent=self.window,
        )
        if alt is not None:
            self.photos[index]["alt"] = alt.strip()
            self.refresh_photos()

    def remove_photo(self):
        index = self.selected_index()
        if index is not None:
            self.photos.pop(index)
            self.refresh_photos()

    def data(self):
        return {
            "title": self.title.get(), "date": self.day.get(),
            "description": self.description.get(), "body": self.body.get("1.0", "end").strip(),
            "photos": self.photos,
        }

    def save_draft(self):
        DRAFT.parent.mkdir(parents=True, exist_ok=True)
        DRAFT.write_text(json.dumps(self.data(), ensure_ascii=False, indent=2), encoding="utf-8")

    def load_draft(self):
        if not DRAFT.exists():
            return
        try:
            data = json.loads(DRAFT.read_text(encoding="utf-8"))
            self.title.set(data.get("title", ""))
            self.day.set(data.get("date", date.today().isoformat()))
            self.description.set(data.get("description", ""))
            self.body.insert("1.0", data.get("body", ""))
            self.photos = data.get("photos", [])
            self.refresh_photos()
        except (OSError, ValueError, TypeError):
            messagebox.showwarning("草稿读取失败", "旧草稿无法读取，可以重新填写。", parent=self.window)

    def clear(self):
        self.title.set("")
        self.day.set(date.today().isoformat())
        self.description.set("")
        self.body.delete("1.0", "end")
        self.photos = []
        self.refresh_photos()
        self.save_draft()

    def submit(self, publish):
        data = self.data()
        try:
            self.save_draft()
            if publish:
                check_publish_ready()
            output, images, url = write_entry(data, DRAFT.parent)
            if publish:
                publish_files(output, images, data["title"].strip())
        except (OSError, ValueError, RuntimeError) as error:
            messagebox.showerror(
                "发布失败" if publish else "生成失败",
                f"{error}\n\n草稿已保留。若已生成文件或提交，请检查项目状态后再操作。",
                parent=self.window,
            )
            return
        messagebox.showinfo(
            "已发布" if publish else "已生成",
            f"记录：{output.relative_to(ROOT)}\n照片：{len(images)} 张本地照片\n地址：{url}"
            + ("\n网站将在 GitHub Actions 构建完成后更新。" if publish else ""),
            parent=self.window,
        )
        self.clear()

    def close(self):
        try:
            self.save_draft()
        except OSError as error:
            messagebox.showerror("草稿保存失败", str(error), parent=self.window)
            return
        self.window.destroy()


if __name__ == "__main__":
    root = tk.Tk()
    LifeEditor(root)
    root.mainloop()
