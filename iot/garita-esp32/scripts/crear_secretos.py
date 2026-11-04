# Script previo a la compilación de PlatformIO.
# Si no existe include/secretos.h (está en .gitignore), lo crea a partir del ejemplo
# para que el proyecto compile apenas se clona el repositorio.
import os
import shutil

Import("env")  # noqa: F821  (lo inyecta PlatformIO)

proyecto = env["PROJECT_DIR"]  # noqa: F821
destino = os.path.join(proyecto, "include", "secretos.h")
ejemplo = os.path.join(proyecto, "include", "secretos.h.example")

if not os.path.exists(destino):
    shutil.copyfile(ejemplo, destino)
    print("[garita] include/secretos.h creado a partir de secretos.h.example")
