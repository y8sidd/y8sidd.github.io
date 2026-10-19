from pathlib import Path
import zipfile, json
backup = Path(__file__).resolve().parent
root = backup.parent.parent
with zipfile.ZipFile(backup / "current-version.zip") as archive:
    manifest = json.loads(archive.read("manifest.json"))
    for name in manifest["files"]:
        path = root / name
        if name in manifest["missing"]:
            path.unlink(missing_ok=True)
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(archive.read("files/" + name))
print("Restored the saved current version. Refresh the browser to replay it.")
