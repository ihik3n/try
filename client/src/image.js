// Επεξεργασία φωτογραφιών στη συσκευή πριν την αποστολή (σμίκρυνση, JPEG, σωστός προσανατολισμός).

/** Αποκωδικοποίηση εικόνας με σωστό προσανατολισμό (EXIF). Εναλλακτικά μέσω <img> για παλαιότερα iPhone. */
async function decodeImage(file) {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img; // το Safari εφαρμόζει μόνο του τον προσανατολισμό EXIF στις εικόνες
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }
}

/**
 * Σμίκρυνση φωτογραφίας (μέγιστη πλευρά maxEdge, JPEG).
 * Για τιμολόγια 2576 px (καθαρή ανάγνωση μικρών γραμμάτων), για φωτογραφίες συνταγών 1600 px.
 */
export async function compressImage(file, { maxEdge = 2576, quality = 0.86, keepSmall = true } = {}) {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;
  try {
    const decoded = await decodeImage(file);
    const w = decoded.naturalWidth || decoded.width;
    const h = decoded.naturalHeight || decoded.height;
    const scale = Math.min(1, maxEdge / Math.max(w, h));
    if (keepSmall && scale === 1 && file.size < 2.5 * 1024 * 1024 && ['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    canvas.getContext('2d').drawImage(decoded, 0, 0, canvas.width, canvas.height);
    decoded.close?.();
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', quality));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return file; // ο server θα απορρίψει μη υποστηριζόμενες μορφές με σαφές μήνυμα
  }
}
