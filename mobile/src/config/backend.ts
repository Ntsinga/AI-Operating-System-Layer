// The development runner forwards port 8000 over ADB for both the emulator and
// the USB-connected phone. This avoids relying on the phone being on the same
// Wi-Fi network as the host. For a standalone Wi-Fi build, replace this with a
// reachable HTTPS backend URL.
export const BACKEND_BASE_URL = 'http://127.0.0.1:8000';
