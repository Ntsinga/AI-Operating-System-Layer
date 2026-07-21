// Use the development machine's LAN address so both the emulator and a USB/Wi-Fi
// physical device can reach the same FastAPI process. Keep the backend bound to
// 0.0.0.0:8000 and ensure the phone is on the same network.
export const BACKEND_BASE_URL = 'http://192.168.1.74:8000';
