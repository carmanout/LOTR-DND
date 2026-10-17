import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
VAULT = ROOT / "obsidian" / "LOTR GAME"
INDEX = ROOT / "obsidian" / "notes-index.json"

notes = sorted(
    path.relative_to(VAULT).as_posix()
    for path in VAULT.rglob("*")
    if path.is_file()
    and path.suffix.lower() == ".md"
    and not any(part.startswith(".") for part in path.relative_to(VAULT).parts)
)

INDEX.write_text(json.dumps(notes, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"Indexed {len(notes)} notes in {INDEX.relative_to(ROOT)}")