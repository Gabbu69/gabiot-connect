<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/b9aeb5db-f09e-434f-9462-99aac25f96b4

## Run Locally

**Prerequisites:**  
- Node.js  
- Arduino IDE (or Arduino CLI)  
- A Lafvin Arduino Uno + USB cable

### 1. Install dependencies

```bash
npm install
```

### 2. Environment variables

Create a `.env.local` file and set your Gemini key (and optionally bridge overrides):

```bash
GEMINI_API_KEY=your_gemini_key_here

# Optional: override defaults if needed
# GABIOT_SERIAL_PORT=COM3
# GABIOT_SERIAL_BAUD=115200
# GABIOT_BASE_URL=http://localhost:3000
# GABIOT_BRIDGE_USER=bridge-node
# GABIOT_BRIDGE_PASS=bridge-pass
```

By default the bridge expects your Arduino on `COM3` at `115200` baud and talks to `http://localhost:3000`.

### 3. Flash your Lafvin Arduino Uno

1. Open `arduino/gabiot_lafvin_telemetry.ino` in the Arduino IDE.  
2. Select the correct **board** (`Arduino Uno`) and **port** (e.g. `COM3`).  
3. Adjust the pin definitions at the top of the sketch if your Lafvin sensors are wired differently.  
4. Upload the sketch to your board.

The sketch will start streaming JSON lines like:

```json
{"TEMP_01":23.4,"HUM_01":45.2,"PRES_01":1013.8,"LIGHT_01":512.0,"SOUND_01":34.0,"DIST_01":42.0}
```

### 4. Start the GabIoT server

```bash
npm run dev
```

This runs the Express + Vite dev server on `http://localhost:3000`.

### 5. Start the Arduino serial bridge

In a second terminal from the same folder:

```bash
npm run bridge
```

What this does:

- Connects to your Lafvin Arduino over the serial port.  
- Listens for one JSON object per line from the sketch.  
- Authenticates against the local `/api/auth` endpoints and obtains a JWT cookie.  
- For each key/value (e.g. `TEMP_01`, `HUM_01`, `DIST_01`) it POSTs to `/api/sensors/log`.

As long as the bridge is running and your board is plugged in, the backend database will receive real sensor readings associated with the dashboard’s sensor IDs.

### 6. Log in to the dashboard

1. Open `http://localhost:3000` in your browser.  
2. Register or log in with any username/password.  
3. The dashboard will continue to show its simulated telemetry, but **the sensor_history API and database will now be populated from your Lafvin Uno via the bridge**. Future UI changes can read directly from `/api/sensors/history/:sensor_id` if you want the charts to display only live hardware data.

