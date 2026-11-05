// Διευθύνσεις του υπολογιστή στο τοπικό δίκτυο (για άνοιγμα από iPhone/κινητό στο ίδιο Wi‑Fi).
import os from 'node:os';

// Εικονικοί προσαρμογείς που δεν είναι προσβάσιμοι από το κινητό.
const SKIP = /(vethernet|wsl|virtualbox|vmware|vbox|docker|hyper-v|loopback|bluetooth|utun|awdl|llw|bridge|veth|zerotier|tap-|tun)/i;
const PRIVATE = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;

export function lanUrls(port) {
  const out = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    if (SKIP.test(name)) continue;
    for (const a of addrs || []) {
      if ((a.family !== 'IPv4' && a.family !== 4) || a.internal || a.address.startsWith('169.254.')) continue;
      out.push({ url: `http://${a.address}:${port}`, address: a.address, iface: name, private: PRIVATE.test(a.address) });
    }
  }
  // Πρώτα οι συνηθισμένες οικιακές/επαγγελματικές διευθύνσεις (192.168.x.x κ.λπ.)
  return out.sort((x, y) => Number(y.private) - Number(x.private) || (y.address.startsWith('192.168.') ? 1 : 0) - (x.address.startsWith('192.168.') ? 1 : 0));
}
