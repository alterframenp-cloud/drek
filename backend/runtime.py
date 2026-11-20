"""Prerequisite discovery must work in a fresh Python with no app packages."""
import os
import shutil


def executable(name):
    found = shutil.which(os.environ.get(name.upper() + "_BINARY", name))
    if not found:
        raise RuntimeError(f"No se encontró {name}. Instala FFmpeg y agrega su carpeta bin al PATH.")
    return found
