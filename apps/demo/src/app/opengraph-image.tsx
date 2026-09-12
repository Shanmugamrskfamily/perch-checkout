import { ImageResponse } from "next/og";

/**
 * The link preview.
 *
 * This is a submission that will be pasted into a chat window and an email, so
 * for a lot of people the preview card is the first thing they ever see of it.
 * A link with no image reads as a link someone did not finish.
 *
 * Generated rather than drawn: it stays in step with the palette and the copy
 * because it is built from the same values, and there is no binary to keep in
 * the repository or forget to update.
 */

export const alt =
  "Kestrel Supply Co., a demo store for Perch, an embeddable checkout";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const PAPER = "#faf7f2";
const INK = "#1a1712";
const SOFT = "#6a6257";
const TEAL = "#0e5b62";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: PAPER,
          padding: "72px 80px",
          fontFamily: "sans-serif",
          color: INK,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", fontSize: 26, fontWeight: 600, letterSpacing: -0.4 }}>
            Kestrel Supply Co.
          </div>
          <div style={{ display: "flex", fontSize: 20, color: SOFT }}>
            Bengaluru · ships worldwide
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div
            style={{
              display: "flex",
              fontSize: 76,
              fontWeight: 700,
              letterSpacing: -2.4,
              lineHeight: 1.05,
            }}
          >
            Field Notebook
          </div>
          <div style={{ display: "flex", fontSize: 30, color: SOFT, maxWidth: 760 }}>
            Ninety-six pages of dot grid, sewn so it opens flat. ₹1,450.00, tax added at checkout.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 44,
              height: 44,
              borderRadius: 10,
              background: TEAL,
              color: PAPER,
              fontSize: 22,
              fontWeight: 700,
            }}
          >
            P
          </div>
          <div style={{ display: "flex", fontSize: 24, color: SOFT }}>
            Checkout by Perch — it opens over this page, and the card never touches it
          </div>
        </div>
      </div>
    ),
    size,
  );
}
