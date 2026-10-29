import { QrCode } from "pixelarticons/react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

interface Props {
  /** Called with the text of the first QR code seen; scanning stops there. */
  onScan: (text: string) => void;
  /** Shown under the zone, e.g. when the scanned code isn't a pairing link. */
  error?: string;
}

/**
 * A zone that turns into a camera view once tapped. The camera is only asked for on tap, so
 * opening the screen doesn't pop up a permission prompt for people who pair with a code.
 */
export function QrScanner({ onScan, error }: Props) {
  const { t } = useTranslation();
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState<
    "cameraDenied" | "cameraError" | null
  >(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    if (!scanning) return;
    let stream: MediaStream | undefined;
    let frame = 0;
    let stopped = false;
    let decode: typeof import("jsqr").default;
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true })!;

    function tick() {
      const video = videoRef.current;
      if (stopped || !video) return;
      if (video.readyState >= video.HAVE_ENOUGH_DATA) {
        // Decoding a smaller copy is plenty for a QR code filling part of the view, and much faster.
        const scale = Math.min(1, 480 / Math.max(video.videoWidth, 1));
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const image = context.getImageData(0, 0, canvas.width, canvas.height);
        const code = decode(image.data, image.width, image.height);
        if (code?.data) {
          setScanning(false);
          onScanRef.current(code.data);
          return;
        }
      }
      frame = requestAnimationFrame(tick);
    }

    // The decoder is only downloaded by those who scan.
    Promise.all([
      navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      }),
      import("jsqr"),
    ])
      .then(([s, jsQR]) => {
        stream = s;
        decode = jsQR.default;
        if (stopped) return s.getTracks().forEach((track) => track.stop());
        const video = videoRef.current!;
        video.srcObject = s;
        video.play().catch(() => {});
        frame = requestAnimationFrame(tick);
      })
      .catch((err: unknown) => {
        if (stopped) return;
        setCameraError(
          err instanceof DOMException && err.name === "NotAllowedError"
            ? "cameraDenied"
            : "cameraError",
        );
        setScanning(false);
      });

    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [scanning]);

  const message = cameraError ? t(`pair.${cameraError}`) : error;

  return (
    <div className="qr-scanner">
      {scanning ? (
        <div className="qr-zone">
          <video ref={videoRef} muted playsInline />
          <button
            type="button"
            className="button"
            onClick={() => setScanning(false)}
          >
            {t("pair.stopScan")}
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="qr-zone"
          onClick={() => {
            setCameraError(null);
            setScanning(true);
          }}
        >
          <QrCode width={48} height={48} aria-hidden />
          <strong>{t("pair.scan")}</strong>
          <span className="muted small">{t("pair.scanHelp")}</span>
        </button>
      )}
      {message && <p className="error">{message}</p>}
    </div>
  );
}
