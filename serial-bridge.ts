/// <reference types="node" />

// GabIoT Connect – Lafvin Arduino Uno Serial Bridge
// -------------------------------------------------
// Reads JSON lines from an Arduino over Serial and forwards each key/value
// to the local GabIoT backend at /api/sensors/log.
//
// Expected JSON from the Arduino (one line per sample), e.g.:
// {"TEMP_01":23.4,"HUM_01":45.2,"PRES_01":1013.8,"LIGHT_01":512,"SOUND_01":34,"DIST_01":42}
//
// Configuration (via environment variables or defaults):
//   GABIOT_SERIAL_PORT   – Serial port path (e.g. COM3 on Windows, /dev/ttyACM0 on Linux)
//   GABIOT_SERIAL_BAUD   – Baud rate (default: 115200)
//   GABIOT_BASE_URL      – GabIoT backend URL (default: http://localhost:3000)
//   GABIOT_BRIDGE_USER   – Username used for /api/auth/login (default: bridge-node)
//   GABIOT_BRIDGE_PASS   – Password used for /api/auth/login (default: bridge-pass)

import dotenv from "dotenv";
dotenv.config();

import { SerialPort } from "serialport";
import { ReadlineParser } from "@serialport/parser-readline";

const SERIAL_PATH = process.env.GABIOT_SERIAL_PORT || "COM3";
const BAUD_RATE = Number(process.env.GABIOT_SERIAL_BAUD || "115200");
const BASE_URL = process.env.GABIOT_BASE_URL || "http://localhost:3000";

const BRIDGE_USER = process.env.GABIOT_BRIDGE_USER || "bridge-node";
const BRIDGE_PASS = process.env.GABIOT_BRIDGE_PASS || "bridge-pass";

let jwtCookie: string | null = null;
let isAuthenticating = false;

async function loginOrRegister(): Promise<void> {
  if (isAuthenticating) return;
  isAuthenticating = true;

  try {
    console.log("[GabIoT] Authenticating bridge user...");

    // First attempt: login
    let res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: BRIDGE_USER, password: BRIDGE_PASS }),
    });

    if (res.status === 401 || res.status === 400) {
      console.log("[GabIoT] Bridge user not found, registering...");
      const reg = await fetch(`${BASE_URL}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: BRIDGE_USER, password: BRIDGE_PASS }),
      });

      if (!reg.ok && reg.status !== 400) {
        const text = await reg.text().catch(() => "");
        throw new Error(`Registration failed (${reg.status}): ${text}`);
      }

      // Try login again after registration
      res = await fetch(`${BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: BRIDGE_USER, password: BRIDGE_PASS }),
      });
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Login failed (${res.status}): ${text}`);
    }

    const cookieHeader = res.headers.get("set-cookie");
    if (!cookieHeader) {
      throw new Error("Login succeeded but Set-Cookie header was missing.");
    }

    // Extract the JWT cookie ("token") if present, otherwise keep full header
    const tokenCookie = cookieHeader
      .split(/,(?=[^;]*token=)/) // handle multiple cookies in header
      .map((c) => c.trim())
      .find((c) => c.startsWith("token="));

    jwtCookie = tokenCookie || cookieHeader;

    console.log("[GabIoT] Bridge authenticated successfully.");
  } catch (err: any) {
    console.error("[GabIoT] Authentication error:", err?.message || err);
    jwtCookie = null;
  } finally {
    isAuthenticating = false;
  }
}

async function postReading(sensor_id: string, value: number): Promise<void> {
  if (!Number.isFinite(value)) return;

  if (!jwtCookie) {
    await loginOrRegister();
    if (!jwtCookie) {
      console.warn("[GabIoT] No JWT cookie available, skipping reading.");
      return;
    }
  }

  try {
    const res = await fetch(`${BASE_URL}/api/sensors/log`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: jwtCookie,
      },
      body: JSON.stringify({ sensor_id, value }),
    });

    if (res.status === 401 || res.status === 403) {
      console.warn("[GabIoT] Unauthorized when posting reading, will re-authenticate.");
      jwtCookie = null;
      return;
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(
        `[GabIoT] Failed to log ${sensor_id} (${res.status}): ${text || res.statusText}`
      );
    }
  } catch (err: any) {
    console.error("[GabIoT] Error posting reading:", err?.message || err);
  }
}

function startSerialBridge() {
  console.log(
    `[GabIoT] Starting serial bridge on ${SERIAL_PATH} @ ${BAUD_RATE} -> ${BASE_URL}`
  );

  const port = new SerialPort({ path: SERIAL_PATH, baudRate: BAUD_RATE });
  const parser = port.pipe(new ReadlineParser({ delimiter: "\n" }));

  port.on("open", () => {
    console.log("[GabIoT] Serial port opened.");
  });

  port.on("error", (err) => {
    console.error("[GabIoT] Serial port error:", err.message || err);
  });

  parser.on("data", async (rawLine: string) => {
    const line = rawLine.trim();
    if (!line) return;

    // Ignore comments / diagnostic lines from the Arduino
    if (line.startsWith("#")) {
      console.log("[GabIoT] Device:", line);
      return;
    }

    let payload: unknown;
    try {
      payload = JSON.parse(line);
    } catch (err: any) {
      console.error("[GabIoT] Failed to parse JSON from serial:", line);
      return;
    }

    if (!payload || typeof payload !== "object") {
      console.warn("[GabIoT] Invalid payload (not an object):", line);
      return;
    }

    const entries = Object.entries(payload as Record<string, unknown>);
    for (const [sensor_id, rawValue] of entries) {
      const value = Number(rawValue);
      if (!Number.isFinite(value)) continue;

      await postReading(sensor_id, value);
    }
  });
}

(async () => {
  console.log("[GabIoT] Lafvin Arduino bridge booting...");
  await loginOrRegister();
  startSerialBridge();
})();

