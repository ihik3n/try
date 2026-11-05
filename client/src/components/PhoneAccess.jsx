// Άνοιγμα της εφαρμογής στο iPhone: διεύθυνση + κωδικός QR για σκανάρισμα με την κάμερα.
import { useEffect, useState } from 'react';
import { api } from '../api.js';

const LOCAL = /^(localhost|127\.|\[?::1\]?$)/;

/** Η διεύθυνση που πρέπει να ανοίξει το κινητό. */
export function usePhoneUrls() {
  const [state, setState] = useState({ urls: [], loading: true });
  useEffect(() => {
    if (!LOCAL.test(window.location.hostname)) {
      // Η εφαρμογή ανοίχτηκε ήδη με διεύθυνση δικτύου/domain: αυτή ισχύει και για το κινητό.
      setState({ urls: [window.location.origin], loading: false });
      return;
    }
    api
      .get('/api/lan')
      .then((r) => setState({ urls: r.urls.map((u) => u.url), loading: false }))
      .catch(() => setState({ urls: [], loading: false }));
  }, []);
  return state;
}

function Qr({ text, size = 168 }) {
  const [svg, setSvg] = useState('');
  useEffect(() => {
    let off = false;
    import('qrcode')
      .then((m) => (m.default || m).toString(text, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#2b1d14', light: '#ffffff' } }))
      .then((s) => !off && setSvg(s))
      .catch(() => {});
    return () => {
      off = true;
    };
  }, [text]);
  return <div className="qr" style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: svg }} aria-label={`Κωδικός QR για ${text}`} />;
}

export function PhoneAccess({ compact }) {
  const { urls, loading } = usePhoneUrls();
  if (loading) return null;
  if (!urls.length) {
    return <p className="small muted">Δεν βρέθηκε διεύθυνση τοπικού δικτύου. Βεβαιωθείτε ότι ο υπολογιστής είναι συνδεδεμένος στο Wi‑Fi ή με καλώδιο στο ίδιο δίκτυο με το iPhone.</p>;
  }
  const main = urls[0];
  return (
    <div className="phone-access">
      <Qr text={main} />
      <div style={{ flex: 1, minWidth: 200 }}>
        <p style={{ marginBottom: '.4rem' }}>
          Σκανάρετε τον κωδικό με την <b>κάμερα του iPhone</b> ή γράψτε στο Safari:
        </p>
        <p className="phone-url">{main}</p>
        {urls.length > 1 && <p className="small muted">Αν δεν ανοίγει, δοκιμάστε: {urls.slice(1).join(' · ')}</p>}
        {!compact && (
          <details className="more">
            <summary>Δεν ανοίγει στο iPhone;</summary>
            <ol className="small" style={{ paddingLeft: '1.1rem', margin: '.3rem 0 0' }}>
              <li>Το iPhone πρέπει να είναι στο <b>ίδιο Wi‑Fi</b> με τον υπολογιστή (όχι 4G/5G, όχι «δίκτυο επισκεπτών»).</li>
              <li>
                Στα Windows κάντε <b>μία φορά</b> διπλό κλικ στο <code>allow-iphone-windows.bat</code> (στον φάκελο της εφαρμογής) και πατήστε «Ναι». Επιτρέπει την πρόσβαση στο Τείχος προστασίας μόνο από το τοπικό δίκτυο.
              </li>
              <li>
                Δοκιμή σύνδεσης: ανοίξτε στο iPhone <code>{main}/api/health</code>. Αν εμφανιστεί <code>{'{"ok":true}'}</code>, η σύνδεση δουλεύει.
              </li>
              <li>Το παράθυρο της εφαρμογής στον υπολογιστή πρέπει να μένει ανοιχτό και ο υπολογιστής να μην είναι σε αναστολή.</li>
            </ol>
          </details>
        )}
      </div>
    </div>
  );
}
