import { useEffect, useRef, useState } from 'react';
import { parseDecimal, formatMoney, formatUnitPrice, BASIS_LABEL } from './format.js';
import { navigate } from './router.js';
import { Icon } from './icons.jsx';
import { COMPONENT_LABEL } from '@shared/costing.js';

export function Link({ to, children, className, ...rest }) {
  return (
    <a
      href={`#${to}`}
      className={className}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        navigate(to);
      }}
      {...rest}
    >
      {children}
    </a>
  );
}

function toText(v, decimals = 6) {
  if (v == null || !Number.isFinite(v)) return '';
  const r = Math.round(v * 10 ** decimals) / 10 ** decimals;
  return String(r).replace('.', ',');
}

/**
 * Αριθμητικό πεδίο: δέχεται "2,5" ή "2.5". Στο τέλος της πληκτρολόγησης εμφανίζει τον αριθμό
 * με ελληνικό δεκαδικό ώστε να φαίνεται πώς διαβάστηκε.
 */
export function NumberInput({ value, onChange, className = '', flagged, suffix, allowNegative = false, ...rest }) {
  const [text, setText] = useState(toText(value));
  const [invalid, setInvalid] = useState(false);
  const focused = useRef(false);
  const lastEmitted = useRef(value);

  useEffect(() => {
    if (focused.current && value === lastEmitted.current) return;
    setText(toText(value));
    setInvalid(false);
    lastEmitted.current = value;
  }, [value]);

  const handle = (t) => {
    setText(t);
    const n = parseDecimal(t);
    if (n === null) {
      setInvalid(false);
      lastEmitted.current = null;
      onChange(null);
    } else if (Number.isNaN(n) || (!allowNegative && n < 0)) {
      setInvalid(true);
    } else {
      setInvalid(false);
      lastEmitted.current = n;
      onChange(n);
    }
  };
  const input = (
    <input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      className={`input ${invalid ? 'invalid' : ''} ${flagged ? 'flagged' : ''} ${className}`}
      value={text}
      onChange={(e) => handle(e.target.value)}
      onFocus={(e) => {
        focused.current = true;
        e.target.select?.();
      }}
      onBlur={() => {
        focused.current = false;
        setText(toText(value));
        setInvalid(false);
      }}
      {...rest}
    />
  );
  if (!suffix) return input;
  return (
    <div className="input-suffix">
      {input}
      <span className="suffix">{suffix}</span>
    </div>
  );
}

export function Field({ label, hint, children, className = '' }) {
  return (
    <div className={`field ${className}`}>
      {label && <label>{label}</label>}
      {children}
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

export function TextInput({ value, onChange, className = '', flagged, ...rest }) {
  return <input type="text" className={`input ${flagged ? 'flagged' : ''} ${className}`} value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...rest} />;
}

export function Select({ value, onChange, options, className = '', placeholder, flagged, ...rest }) {
  return (
    <select className={`input ${flagged ? 'flagged' : ''} ${className}`} value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)} {...rest}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Modal({ title, onClose, children, footer, wide, full }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal ${wide ? 'wide' : ''} ${full ? 'full' : ''}`} role="dialog" aria-modal="true">
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="iconbtn" onClick={onClose} aria-label="Κλείσιμο">
            <Icon name="x" />
          </button>
        </div>
        {children}
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Badge({ kind = 'neutral', children, title }) {
  return (
    <span className={`badge ${kind}`} title={title}>
      {children}
    </span>
  );
}

export function SampleBadge({ show }) {
  if (!show) return null;
  return <Badge kind="sample" title="Παραδειγματικά δεδομένα">ΠΑΡΑΔΕΙΓΜΑ</Badge>;
}

export function IncompleteBadge({ show = true }) {
  if (!show) return null;
  return <Badge kind="danger">Ελλιπές κοστολόγιο</Badge>;
}

export function Spinner() {
  return <span className="spinner" aria-label="Φόρτωση" />;
}

export function Empty({ icon = 'file', children }) {
  return (
    <div className="empty">
      <Icon name={icon} />
      <div>{children}</div>
    </div>
  );
}

export function PageHead({ title, back, children, badges }) {
  return (
    <div className="pagehead">
      {back && (
        <Link to={back} className="back" aria-label="Πίσω">
          ‹
        </Link>
      )}
      <h1>
        {title} {badges}
      </h1>
      {children && <div className="toolbar">{children}</div>}
    </div>
  );
}

export function Issues({ issues, title = 'Ελλιπές κοστολόγιο', max = 8 }) {
  if (!issues?.length) return null;
  const uniq = [...new Set(issues.map((i) => (typeof i === 'string' ? i : i.msg)))];
  return (
    <div className="alert danger">
      <span className="strong">⚠ {title}</span>
      <ul>
        {uniq.slice(0, max).map((m) => (
          <li key={m}>{m}</li>
        ))}
        {uniq.length > max && <li>… και {uniq.length - max} ακόμη</li>}
      </ul>
    </div>
  );
}

/** Ανάλυση κόστους ανά συνιστώσα με σαφή ένδειξη για ό,τι δεν έχει καταχωριστεί. */
export function CostBreakdown({ result, perLabel, quantityLabel, basis, compact }) {
  if (!result) return null;
  const pu = result.perUnit;
  const incomplete = !result.complete;
  const NA = { packaging: 'καμία', labor: 'δεν έχει καταχωριστεί', overhead: 'δεν έχουν καταχωριστεί' };
  const row = (k, included) => (
    <div className="costrow" key={k}>
      <span>{COMPONENT_LABEL[k]}</span>
      {included ? <span>{formatMoney(pu ? pu[k] : null)}</span> : <span className="na">{NA[k]}</span>}
    </div>
  );
  return (
    <div className={`costbox ${incomplete ? 'incomplete' : ''}`}>
      <div className="head">
        <span className="big">{pu ? formatMoney(pu.total) : '—'}</span>
        <span className="muted">{perLabel}</span>
        {incomplete && <IncompleteBadge />}
      </div>
      <div className="body">
        {quantityLabel && <div className="muted small" style={{ marginBottom: '.3rem' }}>{quantityLabel}</div>}
        {row('materials', true)}
        {row('packaging', result.batch?.packaging > 0 || result.lines?.some((l) => l.kind === 'packaging'))}
        {row('labor', result.laborIncluded)}
        {row('overhead', result.overheadIncluded)}
        <div className="costrow total">
          <span>Σύνολο {incomplete ? '(μερικό)' : ''}</span>
          <span>{pu ? formatMoney(pu.total) : '—'}</span>
        </div>
        {!compact && (
          <div className="muted small" style={{ marginTop: '.4rem' }}>
            Βάση κοστολόγησης: <b>{BASIS_LABEL[basis || result.basis]}</b>
            {incomplete && ' · Το σύνολο δεν περιλαμβάνει τα στοιχεία που λείπουν.'}
          </div>
        )}
      </div>
    </div>
  );
}

export function PriceText({ material, basis }) {
  const p = material?.price;
  if (!p) return <Badge kind="danger">Χωρίς τιμή</Badge>;
  const v = basis === 'gross' ? (p.vat_rate == null ? null : p.unit_net * (1 + p.vat_rate / 100)) : p.unit_net;
  if (v == null) return <Badge kind="warn">Λείπει ΦΠΑ</Badge>;
  return <span>{formatUnitPrice(v, material.cost_unit)}</span>;
}

export function useDebounced(value, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.value} role="tab" className={value === t.value ? 'active' : ''} onClick={() => onChange(t.value)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Chips({ options, value, onChange }) {
  return (
    <div className="chips">
      {options.map((o) => (
        <button key={o.value} className={`chip ${value === o.value ? 'active' : ''}`} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function DiffText({ diff, pct, money = true }) {
  if (diff == null) return <span className="muted">—</span>;
  const cls = diff > 1e-12 ? 'up' : diff < -1e-12 ? 'down' : '';
  const sign = diff > 0 ? '+' : '';
  return (
    <span className={cls}>
      {money ? `${sign}${formatMoney(diff)}` : ''}
      {pct != null && ` (${pct > 0 ? '+' : ''}${pct.toLocaleString('el-GR', { maximumFractionDigits: Math.abs(pct) < 1 ? 2 : 1 })}%)`}
    </span>
  );
}

export function printSection() {
  document.body.classList.add('print-area-active');
  const done = () => {
    document.body.classList.remove('print-area-active');
    window.removeEventListener('afterprint', done);
  };
  window.addEventListener('afterprint', done);
  window.print();
}
