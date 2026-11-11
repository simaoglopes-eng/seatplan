"""A tiny PNG writer for indexed-colour images, standard library only.

A PNG file is a fixed 8-byte signature followed by "chunks". Each chunk is:
4 bytes length, 4 bytes type (for example b"IHDR"), the data, then a CRC-32
checksum of type and data. We write four chunks:

- IHDR: width, height, bit depth 8, colour type 3 ("indexed": every pixel is
  one byte that points into a palette);
- PLTE: the palette, three bytes (red, green, blue) per colour;
- IDAT: the pixel rows, each starting with filter byte 0 ("no filter"),
  all compressed with zlib;
- IEND: the empty end marker.

Spec: https://www.w3.org/TR/png/ (sections 5 and 11).
"""

import binascii
import struct
import zlib

SIGNATURE = b"\x89PNG\r\n\x1a\n"
BIT_DEPTH = 8
COLOUR_TYPE_INDEXED = 3


def _chunk(kind: bytes, data: bytes) -> bytes:
    checksum = binascii.crc32(kind + data) & 0xFFFFFFFF
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", checksum)


def encode_indexed(
    width: int, height: int, pixels: bytes | bytearray, palette: tuple[tuple[int, int, int], ...]
) -> bytes:
    """Return the PNG file for `pixels`: one palette index per pixel, row by row."""
    if len(pixels) != width * height:
        raise ValueError("pixels must hold exactly width * height bytes")
    if not 1 <= len(palette) <= 256:
        raise ValueError("an indexed PNG has 1 to 256 palette entries")
    rows = (b"\x00" + bytes(pixels[y * width : (y + 1) * width]) for y in range(height))
    header = struct.pack(">IIBBBBB", width, height, BIT_DEPTH, COLOUR_TYPE_INDEXED, 0, 0, 0)
    colours = b"".join(bytes(colour) for colour in palette)
    return (
        SIGNATURE
        + _chunk(b"IHDR", header)
        + _chunk(b"PLTE", colours)
        + _chunk(b"IDAT", zlib.compress(b"".join(rows), 9))
        + _chunk(b"IEND", b"")
    )


def png_width(png: bytes) -> int:
    """The width written in a PNG's IHDR chunk (bytes 16 to 19 of the file)."""
    if png[:8] != SIGNATURE:
        raise ValueError("not a PNG file")
    return int(struct.unpack(">I", png[16:20])[0])
