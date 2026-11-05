// Προβολή PDF μέσα στην εφαρμογή (όλες οι σελίδες) για iPhone/iPad/Android,
// όπου το ενσωματωμένο πλαίσιο δείχνει μόνο την πρώτη σελίδα ή κανένα περιεχόμενο.
import { useEffect, useRef, useState } from 'react';
import { fetchBlob } from '../api.js';
import { Spinner } from '../ui.jsx';

let pdfjsPromise = null;
function loadPdfJs() {
  if (!pdfjsPromise) {
    pdfjsPromise = Promise.all([import('pdfjs-dist/legacy/build/pdf.mjs'), import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')]).then(([pdfjs, worker]) => {
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

export function PdfView({ url }) {
  const holder = useRef(null);
  const [state, setState] = useState({ loading: true, pages: 0, error: null });
  const [zoom, setZoom] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let doc = null;
    const urls = [];
    (async () => {
      try {
        const [pdfjs, blob] = await Promise.all([loadPdfJs(), fetchBlob(url)]);
        const data = new Uint8Array(await blob.arrayBuffer());
        // Τα παραστατικά προέρχονται από τρίτους: μόνο απεικόνιση (χωρίς φόρμες XFA/σενάρια), με όριο μεγέθους εικόνων.
        doc = await pdfjs.getDocument({ data, enableXfa: false, maxImageSize: 40_000_000, stopAtErrors: false }).promise;
        if (cancelled) return;
        const el = holder.current;
        el.innerHTML = '';
        const width = Math.max(320, el.clientWidth || 360);
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        for (let n = 1; n <= doc.numPages; n++) {
          const page = await doc.getPage(n);
          if (cancelled) return;
          const base = page.getViewport({ scale: 1 });
          // Ανάλυση αρκετή για ανάγνωση μικρών γραμμάτων με μεγέθυνση, με όριο μνήμης για κινητά.
          const scale = Math.min(2.5, (width * dpr * 1.6) / base.width);
          const vp = page.getViewport({ scale });
          const canvas = document.createElement('canvas');
          canvas.width = Math.floor(vp.width);
          canvas.height = Math.floor(vp.height);
          await page.render({ canvas, canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
          page.cleanup();
          if (cancelled) return;
          // Μετατροπή σε εικόνα και αποδέσμευση του canvas (το iOS έχει αυστηρό όριο μνήμης για canvas).
          const blobImg = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.9));
          canvas.width = 0;
          canvas.height = 0;
          if (cancelled) return;
          const img = document.createElement('img');
          img.className = 'pdf-page';
          img.alt = `Σελίδα ${n}`;
          img.src = URL.createObjectURL(blobImg);
          urls.push(img.src);
          el.appendChild(img);
          setState({ loading: n < doc.numPages, pages: doc.numPages, error: null });
        }
      } catch (e) {
        if (!cancelled) setState({ loading: false, pages: 0, error: e.message || 'Σφάλμα' });
      }
    })();
    return () => {
      cancelled = true;
      doc?.destroy?.();
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [url]);

  return (
    <div className="pdf-view">
      {state.error && <div className="alert danger">Δεν ήταν δυνατή η εμφάνιση του PDF: {state.error}</div>}
      <div className="zoomwrap">
        <div ref={holder} className={`pdf-pages ${zoom ? 'zoomed' : ''}`} onClick={() => setZoom((z) => !z)} />
      </div>
      {state.loading && (
        <p className="small muted">
          <Spinner /> Φόρτωση σελίδων…
        </p>
      )}
      {state.pages > 0 && !state.loading && <p className="small muted">{state.pages} σελίδες · πατήστε για μεγέθυνση</p>}
    </div>
  );
}
