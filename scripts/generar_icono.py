"""Genera scripts/passo.ico: un teclado de piano sobre el degradado índigo de la aplicación.

Sin dependencias extra. Uso (desde la raíz): python scripts/generar_icono.py
La versión vectorial del mismo dibujo está en public/favicon.svg (si cambias uno, cambia el otro).
"""

import struct
import zlib
from pathlib import Path

SIZES = (16, 32, 48, 64, 128, 256)
SUPER = 4  # sobremuestreo para suavizar los bordes
TOP, BOTTOM = (143, 164, 255), (52, 84, 209)  # el acento de la app: #8fa4ff → #3454d1
WHITE, SEPARATOR, BLACK = (250, 251, 255), (176, 190, 240), (24, 34, 92)
RADIUS = 0.22  # esquinas del cuadro, como fracción del lado
BOARD = (0.16, 0.24, 0.84, 0.78)  # el teclado: x0, y0, x1, y1 en un lienzo de 1 x 1
BOARD_RADIUS = 0.045
SPLITS = (0.16 + 0.68 / 3, 0.16 + 2 * 0.68 / 3)  # donde se separan las tres teclas blancas
SEPARATOR_WIDTH = 0.016
BLACK_WIDTH, BLACK_BOTTOM, BLACK_RADIUS = 0.115, 0.54, 0.03


def in_rounded_rect(x: float, y: float, x0: float, y0: float, x1: float, y1: float, r: float) -> bool:
    if not (x0 <= x <= x1 and y0 <= y <= y1):
        return False
    dx = max(x0 + r - x, x - (x1 - r), 0.0)
    dy = max(y0 + r - y, y - (y1 - r), 0.0)
    return dx * dx + dy * dy <= r * r


def sample(x: float, y: float) -> tuple[int, int, int] | None:
    """El color del punto (x, y), o None si cae fuera del cuadro (transparente)."""
    if not in_rounded_rect(x, y, 0.0, 0.0, 1.0, 1.0, RADIUS):
        return None
    if not in_rounded_rect(x, y, *BOARD, BOARD_RADIUS):
        return tuple(round(TOP[i] + (BOTTOM[i] - TOP[i]) * y) for i in range(3))
    color = SEPARATOR if any(abs(x - s) <= SEPARATOR_WIDTH / 2 for s in SPLITS) else WHITE
    for s in SPLITS:
        # Las teclas negras cuelgan del borde de arriba del teclado: solo se redondea su parte de abajo.
        half = BLACK_WIDTH / 2
        if in_rounded_rect(x, y, s - half, BOARD[1] - BLACK_RADIUS, s + half, BLACK_BOTTOM, BLACK_RADIUS):
            color = BLACK
    return color


def render(size: int) -> bytes:
    rows = []
    total = SUPER * SUPER
    for py in range(size):
        row = bytearray([0])  # filtro PNG "None"
        for px in range(size):
            red = green = blue = covered = 0
            for sy in range(SUPER):
                for sx in range(SUPER):
                    color = sample((px + (sx + 0.5) / SUPER) / size, (py + (sy + 0.5) / SUPER) / size)
                    if color is not None:
                        covered += 1
                        red += color[0]
                        green += color[1]
                        blue += color[2]
            if covered == 0:
                row += bytes((0, 0, 0, 0))
            else:
                row += bytes((round(red / covered), round(green / covered), round(blue / covered), round(255 * covered / total)))
        rows.append(bytes(row))
    return b"".join(rows)


def png(size: int) -> bytes:
    def chunk(kind: bytes, data: bytes) -> bytes:
        body = kind + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body))

    header = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)  # RGBA de 8 bits
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", header)
        + chunk(b"IDAT", zlib.compress(render(size), 9))
        + chunk(b"IEND", b"")
    )


def main() -> None:
    images = [png(s) for s in SIZES]
    offset = 6 + 16 * len(SIZES)
    ico = struct.pack("<HHH", 0, 1, len(SIZES))
    for size, data in zip(SIZES, images):
        dim = 0 if size >= 256 else size
        ico += struct.pack("<BBBBHHII", dim, dim, 0, 0, 1, 32, len(data), offset)
        offset += len(data)
    target = Path(__file__).with_name("passo.ico")
    target.write_bytes(ico + b"".join(images))
    # Una copia grande para verla (y para usarla donde haga falta un PNG).
    Path(__file__).with_name("passo-256.png").write_bytes(images[-1])
    print(f"Icono generado: {target}")


if __name__ == "__main__":
    main()
