package dev.tidings.core;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;

/**
 * A QR code for some text, in byte mode. The mod draws it on a map, so it needs no rendering, and
 * avoids bundling a library. Follows ISO/IEC 18004, structured like Nayuki's reference
 * implementation (MIT)
 */
public final class QrCode {
    // Error correction level
    public enum Ecc {
        LOW(1),
        MEDIUM(0),
        QUARTILE(3),
        HIGH(2);

        final int formatBits;

        Ecc(int formatBits) {
            this.formatBits = formatBits;
        }
    }

    public static final int MIN_VERSION = 1;
    public static final int MAX_VERSION = 40;

    public final int version;

    public final int size;

    private final boolean[][] modules; // [y][x], true is dark
    private final boolean[][] isFunction;

    private QrCode(int version) {
        this.version = version;
        size = version * 4 + 17;
        modules = new boolean[size][size];
        isFunction = new boolean[size][size];
    }

    public boolean isDark(int x, int y) {
        return modules[y][x];
    }

    public static QrCode encode(String text, Ecc ecc) {
        byte[] data = text.getBytes(StandardCharsets.UTF_8);
        for (int version = MIN_VERSION; version <= MAX_VERSION; version++) {
            int capacityBits = numDataCodewords(version, ecc) * 8;
            int countBits = version <= 9 ? 8 : 16;
            if (data.length < (1 << countBits) && 4 + countBits + data.length * 8 <= capacityBits) {
                return encode(data, version, ecc);
            }
        }
        throw new IllegalArgumentException("Too long for a QR code: " + data.length + " bytes");
    }

    private static QrCode encode(byte[] data, int version, Ecc ecc) {
        BitBuffer bits = new BitBuffer();
        bits.append(0b0100, 4);
        bits.append(data.length, version <= 9 ? 8 : 16);
        for (byte b : data) bits.append(b & 0xFF, 8);
        int capacityBits = numDataCodewords(version, ecc) * 8;
        bits.append(0, Math.min(4, capacityBits - bits.length));
        bits.append(0, (8 - bits.length % 8) % 8);
        for (int pad = 0xEC; bits.length < capacityBits; pad ^= 0xEC ^ 0x11) bits.append(pad, 8);

        QrCode qr = new QrCode(version);
        qr.drawFunctionPatterns(ecc);
        qr.drawCodewords(addEccAndInterleave(bits.toBytes(), version, ecc));
        qr.applyBestMask(ecc);
        return qr;
    }

    // Function patterns

    private void drawFunctionPatterns(Ecc ecc) {
        for (int i = 0; i < size; i++) {
            setFunction(6, i, i % 2 == 0);
            setFunction(i, 6, i % 2 == 0);
        }
        drawFinderPattern(3, 3);
        drawFinderPattern(size - 4, 3);
        drawFinderPattern(3, size - 4);

        int[] positions = alignmentPatternPositions();
        int n = positions.length;
        for (int i = 0; i < n; i++) {
            for (int j = 0; j < n; j++) {
                if ((i == 0 && j == 0) || (i == 0 && j == n - 1) || (i == n - 1 && j == 0)) {
                    continue;
                }
                drawAlignmentPattern(positions[i], positions[j]);
            }
        }

        drawFormatBits(ecc, 0);
        drawVersion();
    }

    private void drawFinderPattern(int x, int y) {
        for (int dy = -4; dy <= 4; dy++) {
            for (int dx = -4; dx <= 4; dx++) {
                int dist = Math.max(Math.abs(dx), Math.abs(dy));
                int xx = x + dx;
                int yy = y + dy;
                if (0 <= xx && xx < size && 0 <= yy && yy < size) {
                    setFunction(xx, yy, dist != 2 && dist != 4);
                }
            }
        }
    }

    private void drawAlignmentPattern(int x, int y) {
        for (int dy = -2; dy <= 2; dy++) {
            for (int dx = -2; dx <= 2; dx++) {
                setFunction(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) != 1);
            }
        }
    }

    private int[] alignmentPatternPositions() {
        if (version == 1) return new int[0];
        int n = version / 7 + 2;
        int step = (version * 8 + n * 3 + 5) / (n * 4 - 4) * 2;
        int[] result = new int[n];
        result[0] = 6;
        for (int i = n - 1, pos = size - 7; i >= 1; i--, pos -= step) result[i] = pos;
        return result;
    }

    private void drawFormatBits(Ecc ecc, int mask) {
        int data = ecc.formatBits << 3 | mask;
        int rem = data;
        for (int i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
        int bits = (data << 10 | rem) ^ 0x5412;

        for (int i = 0; i <= 5; i++) setFunction(8, i, bit(bits, i));
        setFunction(8, 7, bit(bits, 6));
        setFunction(8, 8, bit(bits, 7));
        setFunction(7, 8, bit(bits, 8));
        for (int i = 9; i < 15; i++) setFunction(14 - i, 8, bit(bits, i));

        for (int i = 0; i < 8; i++) setFunction(size - 1 - i, 8, bit(bits, i));
        for (int i = 8; i < 15; i++) setFunction(8, size - 15 + i, bit(bits, i));
        setFunction(8, size - 8, true); // always dark
    }

    private void drawVersion() {
        if (version < 7) return;
        int rem = version;
        for (int i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
        int bits = version << 12 | rem;
        for (int i = 0; i < 18; i++) {
            boolean dark = bit(bits, i);
            int a = size - 11 + i % 3;
            int b = i / 3;
            setFunction(a, b, dark);
            setFunction(b, a, dark);
        }
    }

    private void setFunction(int x, int y, boolean dark) {
        modules[y][x] = dark;
        isFunction[y][x] = true;
    }

    // Data

    private void drawCodewords(byte[] data) {
        int i = 0;
        for (int right = size - 1; right >= 1; right -= 2) {
            if (right == 6) right = 5;
            for (int vert = 0; vert < size; vert++) {
                for (int j = 0; j < 2; j++) {
                    int x = right - j;
                    boolean upward = ((right + 1) & 2) == 0;
                    int y = upward ? size - 1 - vert : vert;
                    if (!isFunction[y][x] && i < data.length * 8) {
                        modules[y][x] = bit(data[i >>> 3], 7 - (i & 7));
                        i++;
                    }
                }
            }
        }
    }

    private static byte[] addEccAndInterleave(byte[] data, int version, Ecc ecc) {
        int numBlocks = NUM_ERROR_CORRECTION_BLOCKS[ecc.ordinal()][version];
        int blockEccLen = ECC_CODEWORDS_PER_BLOCK[ecc.ordinal()][version];
        int rawCodewords = numRawDataModules(version) / 8;
        int numShortBlocks = numBlocks - rawCodewords % numBlocks;
        int shortBlockLen = rawCodewords / numBlocks;

        byte[] divisor = reedSolomonDivisor(blockEccLen);
        byte[][] blocks = new byte[numBlocks][];
        for (int i = 0, k = 0; i < numBlocks; i++) {
            int dataLen = shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1);
            byte[] block = new byte[shortBlockLen + 1];
            System.arraycopy(data, k, block, 0, dataLen);
            k += dataLen;
            byte[] eccBytes = reedSolomonRemainder(block, dataLen, divisor);
            System.arraycopy(eccBytes, 0, block, shortBlockLen + 1 - blockEccLen, blockEccLen);
            blocks[i] = block;
        }

        byte[] result = new byte[rawCodewords];
        int n = 0;
        for (int i = 0; i < shortBlockLen + 1; i++) {
            for (int j = 0; j < numBlocks; j++) {
                if (i != shortBlockLen - blockEccLen || j >= numShortBlocks) {
                    result[n++] = blocks[j][i];
                }
            }
        }
        return result;
    }

    // Masks

    private void applyBestMask(Ecc ecc) {
        int best = 0;
        int bestPenalty = Integer.MAX_VALUE;
        for (int mask = 0; mask < 8; mask++) {
            applyMask(mask);
            drawFormatBits(ecc, mask);
            int penalty = penalty();
            if (penalty < bestPenalty) {
                best = mask;
                bestPenalty = penalty;
            }
            applyMask(mask);
        }
        applyMask(best);
        drawFormatBits(ecc, best);
    }

    private void applyMask(int mask) {
        for (int y = 0; y < size; y++) {
            for (int x = 0; x < size; x++) {
                boolean invert =
                        switch (mask) {
                            case 0 -> (x + y) % 2 == 0;
                            case 1 -> y % 2 == 0;
                            case 2 -> x % 3 == 0;
                            case 3 -> (x + y) % 3 == 0;
                            case 4 -> (x / 3 + y / 2) % 2 == 0;
                            case 5 -> x * y % 2 + x * y % 3 == 0;
                            case 6 -> (x * y % 2 + x * y % 3) % 2 == 0;
                            default -> ((x + y) % 2 + x * y % 3) % 2 == 0;
                        };
                modules[y][x] ^= invert && !isFunction[y][x];
            }
        }
    }

    /**
     * How hard the code is to scan, to pick the mask
     */
    private int penalty() {
        int result = 0;
        for (int y = 0; y < size; y++) {
            result += runPenalty(true, y);
            result += runPenalty(false, y);
        }
        for (int y = 0; y < size - 1; y++) {
            for (int x = 0; x < size - 1; x++) {
                boolean c = modules[y][x];
                if (c == modules[y][x + 1]
                        && c == modules[y + 1][x]
                        && c == modules[y + 1][x + 1]) {
                    result += 3;
                }
            }
        }
        int dark = 0;
        for (boolean[] row : modules) {
            for (boolean module : row) if (module) dark++;
        }
        int total = size * size;
        int k = (Math.abs(dark * 20 - total * 10) + total - 1) / total - 1;
        return result + Math.max(0, k) * 10;
    }

    private int runPenalty(boolean horizontal, int line) {
        int result = 0;
        int run = 0;
        boolean color = false;
        for (int i = 0; i < size; i++) {
            boolean c = horizontal ? modules[line][i] : modules[i][line];
            if (i > 0 && c == color) {
                run++;
            } else {
                if (run >= 5) result += run - 2;
                color = c;
                run = 1;
            }
        }
        if (run >= 5) result += run - 2;
        return result;
    }

    private static byte[] reedSolomonDivisor(int degree) {
        byte[] result = new byte[degree];
        result[degree - 1] = 1;
        int root = 1;
        for (int i = 0; i < degree; i++) {
            for (int j = 0; j < result.length; j++) {
                result[j] = (byte) multiply(result[j] & 0xFF, root);
                if (j + 1 < result.length) result[j] ^= result[j + 1];
            }
            root = multiply(root, 0x02);
        }
        return result;
    }

    private static byte[] reedSolomonRemainder(byte[] data, int length, byte[] divisor) {
        byte[] result = new byte[divisor.length];
        for (int n = 0; n < length; n++) {
            int factor = (data[n] ^ result[0]) & 0xFF;
            System.arraycopy(result, 1, result, 0, result.length - 1);
            result[result.length - 1] = 0;
            for (int i = 0; i < result.length; i++) {
                result[i] ^= (byte) multiply(divisor[i] & 0xFF, factor);
            }
        }
        return result;
    }

    private static int multiply(int x, int y) {
        int z = 0;
        for (int i = 7; i >= 0; i--) {
            z = (z << 1) ^ ((z >>> 7) * 0x11D);
            z ^= ((y >>> i) & 1) * x;
        }
        return z;
    }

    // Capacity

    private static int numRawDataModules(int version) {
        int result = (16 * version + 128) * version + 64;
        if (version >= 2) {
            int numAlign = version / 7 + 2;
            result -= (25 * numAlign - 10) * numAlign - 55;
            if (version >= 7) result -= 36;
        }
        return result;
    }

    private static int numDataCodewords(int version, Ecc ecc) {
        return numRawDataModules(version) / 8
                - ECC_CODEWORDS_PER_BLOCK[ecc.ordinal()][version]
                        * NUM_ERROR_CORRECTION_BLOCKS[ecc.ordinal()][version];
    }

    private static boolean bit(int x, int i) {
        return ((x >>> i) & 1) != 0;
    }

    private static final class BitBuffer {
        private final ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        private int current;
        int length;

        void append(int value, int count) {
            for (int i = count - 1; i >= 0; i--) {
                current = current << 1 | ((value >>> i) & 1);
                length++;
                if (length % 8 == 0) {
                    bytes.write(current);
                    current = 0;
                }
            }
        }

        byte[] toBytes() {
            return bytes.toByteArray();
        }
    }

    private static final int[][] ECC_CODEWORDS_PER_BLOCK = {
        {
            -1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28,
            28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30
        },
        {
            -1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26,
            28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28
        },
        {
            -1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28,
            30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30
        },
        {
            -1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30,
            24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30
        },
    };

    private static final int[][] NUM_ERROR_CORRECTION_BLOCKS = {
        {
            -1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12,
            13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25
        },
        {
            -1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20,
            21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49
        },
        {
            -1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27,
            29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68
        },
        {
            -1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30,
            32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81
        },
    };
}
