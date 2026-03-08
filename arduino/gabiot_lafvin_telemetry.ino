// GabIoT Connect – Lafvin Arduino Uno Telemetry
// -------------------------------------------------
// Sends sensor readings as a single-line JSON object over Serial, e.g.:
// {"TEMP_01":23.4,"HUM_01":45.2,"PRES_01":1013.8,"LIGHT_01":512,"SOUND_01":34,"DIST_01":42}
//
// This is designed to work with the Node.js serial bridge in this repo.
// Adjust pin definitions to match your Lafvin kit wiring.

#define USE_DHT        1   // Set to 0 if you don't have / don't want to use a DHT sensor
#define USE_BMP280     0   // Set to 1 if you have a BMP280/BME280 + library installed

#if USE_DHT
  #include <DHT.h>
  #define DHTPIN   2          // Digital pin for DHT
  #define DHTTYPE  DHT11      // Change to DHT22 if needed
  DHT dht(DHTPIN, DHTTYPE);
#endif

#if USE_BMP280
  #include <Wire.h>
  #include <Adafruit_BMP280.h>
  Adafruit_BMP280 bmp;        // I2C interface
#endif

// Basic analog sensors from Lafvin kit (adjust as needed)
const int LDR_PIN   = A0;     // Photoresistor
const int SOUND_PIN = A1;     // Sound sensor (microphone module)

// HC-SR04 ultrasonic sensor for distance
const int TRIG_PIN  = 9;
const int ECHO_PIN  = 10;

// Helper: read distance from HC-SR04 (cm)
float readDistanceCm() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  long duration = pulseIn(ECHO_PIN, HIGH, 25000UL); // timeout ~25ms (~4m)
  if (duration == 0) {
    return -1.0; // timeout / invalid
  }

  // Speed of sound ~343 m/s => 29.1 µs/cm for round trip -> divide by 58 for cm
  float distance = duration / 58.0;
  return distance;
}

void setup() {
  Serial.begin(115200);
  delay(2000); // Give host time to open the port

#if USE_DHT
  dht.begin();
#endif

#if USE_BMP280
  if (!bmp.begin(0x76) && !bmp.begin(0x77)) {
    Serial.println(F("# BMP280 not found – PRES_01 will use a fallback value."));
  }
#endif

  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);

  Serial.println(F("# GabIoT Lafvin telemetry online."));
}

void loop() {
  // --- Temperature & Humidity (DHT) ---
  float temperature = NAN;
  float humidity    = NAN;

#if USE_DHT
  temperature = dht.readTemperature(); // Celsius
  humidity    = dht.readHumidity();
  if (isnan(temperature) || isnan(humidity)) {
    Serial.println(F("# DHT read failed – check wiring or sensor."));
  }
#endif

  // --- Pressure (BMP280 or fallback) ---
  float pressure_hPa = 1013.25; // default approximate sea-level pressure

#if USE_BMP280
  if (bmp.begin(0x76) || bmp.begin(0x77)) {
    pressure_hPa = bmp.readPressure() / 100.0F; // Pa to hPa
  }
#endif

  // --- Light (LDR) ---
  int ldrRaw = analogRead(LDR_PIN);       // 0–1023
  float lightLuxApprox = (ldrRaw / 1023.0) * 1000.0; // simple scaling to ~0–1000 "lux"

  // --- Sound (microphone module) ---
  int soundRaw = analogRead(SOUND_PIN);   // 0–1023
  float soundDbApprox = (soundRaw / 1023.0) * 100.0; // rough 0–100 "dB" style scale

  // --- Distance (HC-SR04) ---
  float distanceCm = readDistanceCm();
  if (distanceCm < 0) {
    // If invalid, use a large value so the dashboard treats it as "no obstacle"
    distanceCm = 400.0;
    Serial.println(F("# Ultrasonic timeout – DIST_01 set to 400cm."));
  }

  // --- Emit JSON payload on a single line ---
  // Keys are aligned with the dashboard's SENSORS definition:
  // TEMP_01, HUM_01, PRES_01, LIGHT_01, SOUND_01, DIST_01
  Serial.print("{");

  // Temperature (TEMP_01)
  Serial.print("\"TEMP_01\":");
  if (isnan(temperature)) {
    Serial.print("null");
  } else {
    Serial.print(temperature, 2);
  }

  // Humidity (HUM_01)
  Serial.print(",\"HUM_01\":");
  if (isnan(humidity)) {
    Serial.print("null");
  } else {
    Serial.print(humidity, 2);
  }

  // Pressure (PRES_01)
  Serial.print(",\"PRES_01\":");
  Serial.print(pressure_hPa, 2);

  // Light (LIGHT_01)
  Serial.print(",\"LIGHT_01\":");
  Serial.print(lightLuxApprox, 2);

  // Sound (SOUND_01)
  Serial.print(",\"SOUND_01\":");
  Serial.print(soundDbApprox, 2);

  // Distance (DIST_01)
  Serial.print(",\"DIST_01\":");
  Serial.print(distanceCm, 2);

  Serial.println("}");

  // Adjust the interval as needed; 1000 ms = 1 Hz
  delay(1000);
}

