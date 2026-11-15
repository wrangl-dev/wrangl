import { isTokenAddress, TOKEN_CA, TOKEN_EXPLORER_URL } from '../../lib/token';
import { useCopyFeedback } from '../../lib/use-copy-feedback';

/** Hero contract-address slot. Stays hidden until TOKEN_CA (src/lib/token.ts) is filled. */
export function TokenCa() {
  const { label, copy } = useCopyFeedback();
  const valid = isTokenAddress(TOKEN_CA);

  return (
    <div className="ca" id="ca" hidden={!valid}>
      <span className="ca-k">CA</span>
      <code id="ca-addr">{valid ? TOKEN_CA : ''}</code>
      <button className="ca-copy" type="button" id="ca-copy" onClick={() => void copy(TOKEN_CA)}>
        {label}
      </button>
      <a
        className="ca-link"
        id="ca-link"
        href={valid ? `${TOKEN_EXPLORER_URL}${TOKEN_CA}` : '#'}
        rel="noopener"
      >
        Explorer ↗
      </a>
    </div>
  );
}
