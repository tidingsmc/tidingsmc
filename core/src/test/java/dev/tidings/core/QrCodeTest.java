package dev.tidings.core;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.google.zxing.BinaryBitmap;
import com.google.zxing.DecodeHintType;
import com.google.zxing.RGBLuminanceSource;
import com.google.zxing.ReaderException;
import com.google.zxing.common.HybridBinarizer;
import com.google.zxing.qrcode.QRCodeReader;

import org.junit.jupiter.api.Test;

import java.util.Map;
import java.util.Random;

/** Scans the codes with ZXing, the library most Android scanners use. */
class QrCodeTest {
    private static final int SCALE = 3;
    private static final int QUIET = 4;

    private static String scan(QrCode qr) throws ReaderException {
        int width = (qr.size + QUIET * 2) * SCALE;
        int[] pixels = new int[width * width];
        for (int y = 0; y < width; y++) {
            for (int x = 0; x < width; x++) {
                int mx = x / SCALE - QUIET;
                int my = y / SCALE - QUIET;
                boolean dark =
                        mx >= 0 && my >= 0 && mx < qr.size && my < qr.size && qr.isDark(mx, my);
                pixels[y * width + x] = dark ? 0xFF000000 : 0xFFFFFFFF;
            }
        }
        BinaryBitmap bitmap =
                new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(width, width, pixels)));
        return new QRCodeReader()
                .decode(bitmap, Map.of(DecodeHintType.PURE_BARCODE, Boolean.TRUE))
                .getText();
    }

    private static String randomText(Random random, int length) {
        StringBuilder text = new StringBuilder();
        for (int i = 0; i < length; i++) text.append((char) (' ' + random.nextInt(95)));
        return text.toString();
    }

    @Test
    void aPairingLinkScans() throws ReaderException {
        String link = "https://tidings.example/#pair=https%3A%2F%2Fmc.example.com&code=123456";

        assertEquals(link, scan(QrCode.encode(link, QrCode.Ecc.MEDIUM)));
    }

    @Test
    void scansAtEveryLevelAndManyVersions() throws ReaderException {
        Random random = new Random(42);
        for (QrCode.Ecc ecc : QrCode.Ecc.values()) {
            int lastVersion = 0;
            for (int length = 0; length <= 1200; length += 1 + length / 12) {
                String text = randomText(random, length);
                QrCode qr;
                try {
                    qr = QrCode.encode(text, ecc);
                } catch (IllegalArgumentException tooLong) {
                    break;
                }
                assertEquals(text, scan(qr), ecc + " version " + qr.version);
                lastVersion = qr.version;
            }
            assertTrue(lastVersion >= 20, ecc + " only reached version " + lastVersion);
        }
    }

    @Test
    void utf8() throws ReaderException {
        String text = "Serveur de Pauline — été ⛏";

        assertEquals(text, scan(QrCode.encode(text, QrCode.Ecc.MEDIUM)));
    }

    @Test
    void refusesTextTooLongForAnyVersion() {
        assertThrows(
                IllegalArgumentException.class,
                () -> QrCode.encode("x".repeat(3000), QrCode.Ecc.LOW));
    }
}
