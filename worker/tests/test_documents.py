"""Project documents from Dropbox, with a fake Dropbox holding invented folders and files."""
import gzip
import json
from pathlib import Path

import pymupdf
import pytest

from hitlist.config import Settings
from hitlist.documents import (DocsError, dropbox_path_from, find_project_folder, read_pages,
                               starts_with_number, update_documents)
from hitlist.runner import process_docs_job, queue_docs_update
from tests.test_worker import make_store


def pdf_bytes(pages):
    doc = pymupdf.open()
    for text in pages:
        doc.new_page().insert_text((72, 72), text)
    data = doc.tobytes()
    doc.close()
    return data


class FakeDbx:
    """Folders and files by lower-case path. Files hold bytes; each has an id and a content hash."""
    def __init__(self):
        self.path_root = None
        self.downloads = []
        self.items = {}
        for p in ["/techs", "/techs/01 resources", "/techs/alex tech", "/techs/sam tech",
                  "/techs/99-002 loose job",
                  "/techs/alex tech/99-001 sample building", "/techs/sam tech/99-001 sample garage",
                  "/techs/alex tech/99-0011 other",
                  "/techs/alex tech/99-001 sample building/submittal",
                  "/techs/alex tech/99-001 sample building/submittal/ahus",
                  "/techs/alex tech/99-001 sample building/drawings and specs",
                  "/techs/alex tech/99-001 sample building/contract"]:
            self.add_folder(p)
        base = "/techs/alex tech/99-001 sample building"
        self.add_file(f"{base}/submittal/ahus/AHU Submittal.pdf", pdf_bytes(["AHU-1 supply 5000 CFM", "AHU-2 supply 6200 CFM"]))
        self.add_file(f"{base}/drawings and specs/Spec 23 05 93.pdf", pdf_bytes(["Balance to plus or minus 10 percent"]))
        self.add_file(f"{base}/drawings and specs/photo.jpg", b"x")
        self.add_file(f"{base}/contract/Contract.pdf", pdf_bytes(["not read"]))

    def _name(self, p):
        return p.rsplit("/", 1)[-1].title() if not p.endswith((".pdf", ".jpg")) else p.rsplit("/", 1)[-1]

    def add_folder(self, p):
        self.items[p.lower()] = {".tag": "folder", "name": self._name(p), "path_lower": p.lower(),
                                 "path_display": p, "id": "id:" + p.lower().replace(" ", "_")}

    def add_file(self, p, data, h=None):
        self.items[p.lower()] = {".tag": "file", "name": self._name(p), "path_lower": p.lower(), "path_display": p,
                                 "id": "id:" + p.lower().replace(" ", "_"), "content_hash": h or str(hash(data)),
                                 "size": len(data), "server_modified": "2026-09-01T10:00:00Z", "data": data}

    def _children(self, path, deep=False):
        path = path.lower()
        out = []
        for k, v in self.items.items():
            if k.startswith(path + "/") and (deep or "/" not in k[len(path) + 1:]):
                out.append({kk: vv for kk, vv in v.items() if kk != "data"})
        return out

    def folders(self, path):
        top = path or ""
        if top == "":
            return [{".tag": "folder", "name": "Techs", "path_lower": "/techs", "path_display": "/techs", "id": "id:t"}]
        return sorted((e for e in self._children(top) if e[".tag"] == "folder"), key=lambda e: e["name"].lower())

    def list_all(self, path):
        return self._children(path, deep=True)

    def metadata(self, path):
        from hitlist.dropbox import DropboxError
        for v in self.items.values():
            if v["id"] == path or v["path_lower"] == path.lower():
                return {k: x for k, x in v.items() if k != "data"}
        raise DropboxError("not_found")

    def download(self, path, dest: Path):
        item = next(v for v in self.items.values() if v["id"] == path)
        self.downloads.append(item["name"])
        dest.write_bytes(item["data"])
        return dest

    def use_team_space(self, *_):
        return True


def test_starts_with_number():
    assert starts_with_number("99-001 Sample", "99-001")
    assert starts_with_number("99-001-Sample", "99-001")
    assert not starts_with_number("99-0011 Other", "99-001")
    assert not starts_with_number("Sample 99-001", "99-001")


def test_find_project_folder_picks_best_name_across_techs_and_loose_folders():
    dbx = FakeDbx()
    assert find_project_folder(dbx, "Techs", "99-001", "Sample Garage")["name"] == "99-001 Sample Garage"
    assert find_project_folder(dbx, "Techs", "99-001", "Sample Building")["name"] == "99-001 Sample Building"
    assert find_project_folder(dbx, "Techs", "99-002", "Loose")["name"] == "99-002 Loose Job"
    assert find_project_folder(dbx, "Techs", "99-999", "x") is None
    with pytest.raises(DocsError):
        find_project_folder(dbx, "Nope", "99-001", "x")


def test_shared_number_needs_a_clear_name_match_and_skips_taken_folders():
    dbx = FakeDbx()
    with pytest.raises(DocsError, match="Several Dropbox folders start with 99-001"):
        find_project_folder(dbx, "Techs", "99-001", "Something Else Entirely")
    building = dbx.metadata("/techs/alex tech/99-001 sample building")["id"]
    # the building folder belongs to the other project on this contract, so only the garage is left
    assert find_project_folder(dbx, "Techs", "99-001", "Sample", taken={building})["name"] == "99-001 Sample Garage"
    loose = dbx.metadata("/techs/99-002 loose job")["id"]
    with pytest.raises(DocsError, match="already linked"):
        find_project_folder(dbx, "Techs", "99-002", "Loose", taken={loose})


def test_dropbox_path_from_pasted_text():
    assert dropbox_path_from(r"C:\Users\X\Co Dropbox\Techs\A\99-001 Job") == "/Techs/A/99-001 Job"
    assert dropbox_path_from("https://www.dropbox.com/home/Techs/A/99-001%20Job?preview=1") == "/Techs/A/99-001 Job"
    with pytest.raises(DocsError):
        dropbox_path_from(r"C:\Users\X\Documents\99-001")


def test_read_pages_pdf_and_excel(tmp_path):
    p = tmp_path / "a.pdf"
    p.write_bytes(pdf_bytes(["one", "two"]))
    assert [t.strip() for t in read_pages(p)] == ["one", "two"]
    from openpyxl import Workbook
    wb = Workbook()
    wb.active.title = "Schedule"
    wb.active.append(["Tag", "CFM"])
    wb.active.append(["AHU-1", 5000])
    x = tmp_path / "s.xlsx"
    wb.save(x)
    assert read_pages(x) == ["[Sheet: Schedule]\nTag | CFM\nAHU-1 | 5000"]


def test_update_documents_reads_only_the_doc_folders_and_skips_unchanged():
    dbx = FakeDbx()
    folder = dbx.metadata("/techs/alex tech/99-001 sample building")
    sent = {}
    m = update_documents(dbx, folder, "99-001", None, lambda n, b: sent.__setitem__(n, json.loads(gzip.decompress(b))), now="t1")
    names = {f["name"]: f for f in m["files"]}
    assert set(names) == {"AHU Submittal.pdf", "Spec 23 05 93.pdf"}        # not the jpg, not the Contract folder
    assert names["AHU Submittal.pdf"]["category"] == "Submittal" and names["AHU Submittal.pdf"]["path"] == "ahus/AHU Submittal.pdf"
    assert names["AHU Submittal.pdf"]["pages"] == 2
    part = sent[names["AHU Submittal.pdf"]["parts"][0]]
    assert "AHU-2 supply 6200 CFM" in part["pages"][1]
    assert m["found"]["TAB Plan"] == 0 and sent["manifest"]["updated_at"] == "t1"
    # second run: nothing changed, nothing downloaded or re-sent except the manifest
    dbx.downloads.clear()
    sent.clear()
    update_documents(dbx, folder, "99-001", m, lambda n, b: sent.__setitem__(n, b))
    assert dbx.downloads == [] and list(sent) == ["manifest"]
    # a changed file is read again
    dbx.add_file("/techs/alex tech/99-001 sample building/drawings and specs/Spec 23 05 93.pdf",
                 pdf_bytes(["Balance to plus or minus 5 percent"]), h="new")
    update_documents(dbx, folder, "99-001", m, lambda n, b: None)
    assert dbx.downloads == ["Spec 23 05 93.pdf"]


def test_docs_job_finds_folder_and_records_status(tmp_path, monkeypatch):
    store = make_store()
    st = Settings(results_dir=tmp_path / "r", docs_dir=tmp_path / "docs", app_url="https://x.example",
                  worker_secret="s" * 20, dropbox_app_key="k", dropbox_app_secret="s",
                  dropbox_refresh_token="t", dropbox_tech_folder="Techs")
    sent = {}
    monkeypatch.setattr("hitlist.runner._docs_uploader", lambda s, n: (lambda part, body: sent.__setitem__(part, body)))
    queue_docs_update(store, st, "99-001", "tech@example.com")
    queue_docs_update(store, st, "99-001", "tech@example.com")          # not queued twice
    jobs = [j for j in store.rows("Queue") if j["kind"] == "docs"]
    assert len(jobs) == 1
    process_docs_job(store, st, jobs[0], dbx=FakeDbx())
    p = store.project("99-001")
    assert p["dropbox_path"].endswith("99-001 sample building") and p["docs_status"] == "ok: 2 files"
    assert store.rows("Queue")[-1]["status"] == "done" and "manifest" in sent
    assert (tmp_path / "docs" / "99-001.json").exists()


def test_docs_job_without_a_folder_explains(tmp_path):
    store = make_store()
    store.update_project("99-001", project_number="99-777")
    st = Settings(docs_dir=tmp_path, app_url="https://x.example", worker_secret="s" * 20,
                  dropbox_app_key="k", dropbox_app_secret="s", dropbox_refresh_token="t", dropbox_tech_folder="Techs")
    job_id = store.request_refresh("99-777", "x", kind="docs")
    job = next(j for j in store.rows("Queue") if j["id"] == job_id)
    process_docs_job(store, st, job, dbx=FakeDbx())
    assert store.rows("Queue")[-1]["status"] == "failed"
    assert "No folder starting with 99-777" in store.project("99-777")["docs_status"]


def test_last_punch_list_is_the_newest_file_in_deficiency_reports():
    from hitlist.documents import last_punch_list
    dbx = FakeDbx()
    folder = dbx.metadata("/techs/alex tech/99-001 sample building")
    assert last_punch_list(dbx, folder) is None                       # no Deficiency Reports folder
    dbx.add_folder("/techs/alex tech/99-001 sample building/deficiency reports")
    assert last_punch_list(dbx, folder) == {}                          # folder but nothing sent yet
    base = "/techs/alex tech/99-001 sample building/deficiency reports"
    dbx.add_file(f"{base}/Punch 1.pdf", b"a")
    dbx.items[f"{base}/punch 1.pdf"]["client_modified"] = "2026-09-14T15:00:00Z"
    dbx.add_folder(f"{base}/old")
    dbx.add_file(f"{base}/old/Punch 2.pdf", b"b")
    dbx.items[f"{base}/old/punch 2.pdf"]["client_modified"] = "2026-09-28T15:00:00Z"
    assert last_punch_list(dbx, folder) == {"name": "Punch 2.pdf", "date": "2026-09-28T15:00:00Z"}


def test_refresh_punch_lists_links_projects_and_feeds_the_monday_email(tmp_path):
    from datetime import datetime, timezone
    from hitlist.mailer import Mailer
    from hitlist.runner import refresh_punch_lists
    from hitlist.summary import send_weekly_summary
    store = make_store()
    st = Settings(dropbox_app_key="k", dropbox_app_secret="s", dropbox_refresh_token="t", dropbox_tech_folder="Techs")
    dbx = FakeDbx()
    base = "/techs/alex tech/99-001 sample building/deficiency reports"
    dbx.add_folder(base)
    dbx.add_file(f"{base}/Punch.pdf", b"a")
    dbx.items[f"{base}/punch.pdf"]["client_modified"] = "2026-09-28T15:00:00Z"
    assert refresh_punch_lists(store, st, dbx=dbx) == 1
    p = store.project("99-001")
    assert p["dropbox_path"].endswith("99-001 sample building") and p["punch_sent"] == "2026-09-28T15:00:00Z"
    store.update_project("99-001", last_sync="2026-10-04T12:00:00+00:00")
    mail = Mailer("app@example.com", "")
    send_weekly_summary(store, st, mail, now=datetime(2026, 10, 5, 12, tzinfo=timezone.utc), dry_run=True, whats_new=[])
    msg = next(m for m in mail.sent if m["To"] == "tech@example.com")
    assert "Last punch list" in msg.get_body(("html",)).get_content()
    assert "Last punch list: 7 days ago" in msg.get_body(("plain",)).get_content()
