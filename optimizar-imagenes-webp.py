"""Convierte las imágenes del catálogo a WebP sin cambiar sus nombres base."""

from __future__ import annotations

import argparse
import os
from pathlib import Path

from PIL import Image, ImageOps


RASTER_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--max-side", type=int, default=900)
    parser.add_argument("--quality", type=int, default=80)
    parser.add_argument("--delete-source", action="store_true")
    parser.add_argument("--force", action="store_true")
    return parser.parse_args()


def normalized_image(source: Path, max_side: int) -> Image.Image:
    with Image.open(source) as opened:
        image = ImageOps.exif_transpose(opened)
        image.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
        has_alpha = image.mode in {"RGBA", "LA"} or "transparency" in image.info
        return image.convert("RGBA" if has_alpha else "RGB")


def convert_image(
    source: Path,
    destination: Path,
    max_side: int,
    quality: int,
    force: bool,
) -> tuple[bool, int, int]:
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_name(f".{destination.name}.{os.getpid()}.tmp")
    before = source.stat().st_size
    same_file = source.resolve() == destination.resolve()

    if source.suffix.lower() == ".webp" and same_file and not force:
        with Image.open(source) as opened:
            if max(opened.size) <= max_side:
                return False, before, before

    image = normalized_image(source, max_side)
    try:
        image.save(
            temporary,
            "WEBP",
            quality=quality,
            method=6,
            exact=image.mode == "RGBA",
        )
    finally:
        image.close()

    after = temporary.stat().st_size
    keep_original = same_file and not force and after >= before

    if keep_original:
        temporary.unlink()
        return False, before, before

    temporary.replace(destination)
    return True, before, after


def main() -> int:
    args = parse_args()
    source_dir = args.source.resolve()
    output_dir = (args.output or source_dir).resolve()

    if not source_dir.is_dir():
        raise SystemExit(f"No existe la carpeta de imágenes: {source_dir}")
    if args.max_side < 1 or not 1 <= args.quality <= 100:
        raise SystemExit("max-side y quality deben ser valores válidos.")

    sources = sorted(
        path for path in source_dir.rglob("*")
        if path.is_file() and path.suffix.lower() in RASTER_EXTENSIONS
    )
    converted = 0
    original_bytes = 0
    final_bytes = 0

    for source in sources:
        relative = source.relative_to(source_dir).with_suffix(".webp")
        destination = output_dir / relative
        changed, before, after = convert_image(
            source,
            destination,
            args.max_side,
            args.quality,
            args.force,
        )
        converted += int(changed)
        original_bytes += before
        final_bytes += after

        if (
            args.delete_source
            and source.suffix.lower() != ".webp"
            and source.exists()
            and destination.exists()
        ):
            source.unlink()

    saved = original_bytes - final_bytes
    print(
        f"Procesadas: {len(sources)} | actualizadas: {converted} | "
        f"resultado: {final_bytes / 1024:.1f} KiB | ahorro: {saved / 1024:.1f} KiB"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
