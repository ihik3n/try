// Πληροφορίες πλατφόρμας (iPhone/iPad, εγκατεστημένη εφαρμογή κ.λπ.).

const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';

/** iPhone, iPod ή iPad (και iPadOS που δηλώνεται ως Mac με οθόνη αφής). */
export const isIOS = /iPad|iPhone|iPod/.test(ua) || (typeof navigator !== 'undefined' && navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export const isAndroid = /Android/i.test(ua);

/** Συσκευή όπου τα PDF δεν εμφανίζονται αξιόπιστα μέσα σε πλαίσιο (iframe). */
export const needsPdfRenderer = isIOS || isAndroid;

/** Ανοιγμένη από το εικονίδιο της αρχικής οθόνης (πλήρης οθόνη, χωρίς γραμμή διευθύνσεων). */
export function isStandalone() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

export function isTouch() {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;
}

/** Μπορεί να ανοίξει το μενού «Κοινοποίηση» του συστήματος με αρχείο (Αποθήκευση στα Αρχεία, Mail, AirDrop…). */
export function canShareFile(file) {
  try {
    return !!(navigator.canShare && navigator.share && navigator.canShare({ files: [file] }));
  } catch {
    return false;
  }
}

/**
 * Παράδοση αρχείου στον χρήστη. Σε iPhone/iPad (και ειδικά στην εγκατεστημένη εφαρμογή) οι λήψεις
 * δεν λειτουργούν αξιόπιστα, οπότε εμφανίζεται παράθυρο με «Αποθήκευση / Κοινοποίηση».
 */
export function deliverFile(blob, name) {
  const file = new File([blob], name, { type: blob.type || 'application/octet-stream' });
  if (isIOS || isStandalone()) {
    window.dispatchEvent(new CustomEvent('app:file-ready', { detail: { file } }));
    return;
  }
  saveWithAnchor(file);
}

export function saveWithAnchor(file) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 4000);
}
