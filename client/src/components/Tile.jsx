// Κάρτα με φωτογραφία για συνταγές και προϊόντα.
import { Link, Badge, SampleBadge } from '../ui.jsx';
import { Thumb } from './Thumb.jsx';
import { formatMoney, COST_UNIT_SHORT } from '../format.js';

export function Tile({ to, item, kind, result, hl, meta }) {
  const value = result?.perUnit ? hl(result.perUnit) : null;
  const unit = COST_UNIT_SHORT[result?.yield?.outputUnit] || 'τεμ.';
  return (
    <Link to={to} className="tile">
      <div className="tmedia">
        <Thumb photo={item.photo} name={item.name} category={item.category} kind={kind} />
        <div className="tbadges">
          {item.is_sample ? <SampleBadge show /> : null}
          {!result?.complete && (
            <span className="badge danger onphoto" title="Λείπουν στοιχεία για πλήρες κόστος">
              Ελλιπές
            </span>
          )}
        </div>
      </div>
      <div className="tbody">
        <div className="tname">{item.name}</div>
        {meta && <div className="tmeta">{meta}</div>}
        <div className="tprice">
          {value != null ? (
            <>
              <b>{formatMoney(value)}</b>
              <span>/{unit}</span>
            </>
          ) : (
            <Badge kind="danger">χωρίς κόστος</Badge>
          )}
        </div>
      </div>
    </Link>
  );
}
