// ctsizer-feedback.jsx — "Give feedback" dialog.
//
// The user writes a description, picks what to include, and sends it: the
// report goes to feedback.php, which creates the GitHub issue with the site's
// token, so no GitHub account is needed. If the relay is unavailable (local
// copy, server error) the prefilled GitHub issue form is offered instead. The
// report can also be copied or downloaded. It is built by
// CTSActivity.buildReport (ctsizer-activity.js); nothing leaves the browser
// until the user presses one of the buttons.
(() => {
const { useState, useMemo, useEffect, useRef } = React;

const CATEGORIES = ['bug', 'suggestion', 'question', 'other'];
const CATEGORY_TITLE = { bug: 'Bug', suggestion: 'Suggestion', question: 'Question', other: 'Other' };

const btn = (primary, disabled) => ({
  padding: '7px 14px', borderRadius: 6, cursor: disabled ? 'not-allowed' : 'pointer',
  fontFamily: 'var(--font-head)', fontSize: 12, fontWeight: 600,
  border: primary ? 'none' : '1px solid var(--border-2)',
  background: primary ? (disabled ? 'var(--surface-3)' : 'var(--accent)') : 'var(--surface-2)',
  color: primary ? (disabled ? 'var(--text-muted)' : '#fff') : 'var(--text-dim)',
});
const label = { fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)',
                textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 };

async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* fall back below */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', '');
    ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch { return false; }
}

const EMAIL_KEY = 'ctsizer_feedback_email';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function storedEmail() { try { return localStorage.getItem(EMAIL_KEY) || ''; } catch { return ''; } }
function storeEmail(v) { try { v ? localStorage.setItem(EMAIL_KEY, v) : localStorage.removeItem(EMAIL_KEY); } catch { /* blocked */ } }

// POST the report to the relay. Resolves to { ok, number } or { error }.
async function sendReport(title, body) {
  try {
    const r = await fetch(CTSActivity.FEEDBACK_ENDPOINT, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, body }),
    });
    const data = await r.json().catch(() => null);
    if (r.ok && data?.ok) return data;
    return { error: data?.error || `http_${r.status}` };
  } catch { return { error: 'network' }; }
}

function stamp() {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

// getContext() → { lang, theme, projName, system, feeders, selection, summary }
function FeedbackDialog({ lang, onClose, getContext }) {
  const L = k => CTSI18n.t(lang, k);
  const [category, setCategory] = useState('bug');
  const [description, setDescription] = useState('');
  const [email, setEmail] = useState(storedEmail);
  const [includeProject, setIncludeProject] = useState(true);
  const [includeActivity, setIncludeActivity] = useState(true);
  const [preview, setPreview] = useState(false);
  const [status, setStatus] = useState(null);     // { kind:'ok'|'warn', text }
  const [openedUrl, setOpenedUrl] = useState(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);          // disables Send until the report changes
  const [sendFailed, setSendFailed] = useState(false); // offers the GitHub issue form
  const textRef = useRef(null);

  useEffect(() => { textRef.current?.focus(); }, []);
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const entries = CTSActivity.getEntries();
  const nErrors = entries.filter(e => e.type === 'error').length;

  const report = useMemo(() => CTSActivity.buildReport({
    ...getContext(), description, email, category: CATEGORY_TITLE[category], includeProject, includeActivity,
  }), [description, email, category, includeProject, includeActivity]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setSent(false); }, [report]);

  const hasText = description.trim().length > 0;
  const emailOk = !email.trim() || EMAIL_RE.test(email.trim());
  const canSend = hasText && emailOk && !sending && !sent;

  const doSend = async () => {
    if (!hasText) { setStatus({ kind: 'warn', text: L('fb_need_description') }); return; }
    if (!emailOk) { setStatus({ kind: 'warn', text: L('fb_email_invalid') }); return; }
    setSending(true); setStatus(null); setOpenedUrl(null);
    const res = await sendReport(report.title, report.sendBody);
    setSending(false);
    if (res.ok) {
      storeEmail(email.trim());
      CTSActivity.log('feedback', `Sent feedback (${CATEGORY_TITLE[category]}, #${res.number})`);
      setSent(true); setSendFailed(false);
      const text = L(report.sendTruncated ? 'fb_sent_short' : 'fb_sent').replace('{n}', res.number);
      setStatus({ kind: 'ok', text });
    } else {
      CTSActivity.log('feedback', `Sending feedback failed (${res.error})`);
      setSendFailed(true);
      setStatus({ kind: 'warn', text: L(res.error === 'rate_limited' ? 'fb_rate_limited' : 'fb_send_failed') });
    }
  };

  const doCopy = async () => {
    const ok = await copyText(report.markdown);
    setStatus(ok ? { kind: 'ok', text: L('fb_copied') } : { kind: 'warn', text: L('fb_copy_failed') });
  };

  const doDownload = () => {
    const blob = new Blob([JSON.stringify(report.json, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ctsizer-feedback-${stamp()}.json`;
    a.click(); URL.revokeObjectURL(a.href);
    CTSActivity.log('feedback', 'Downloaded feedback report');
    setStatus({ kind: 'ok', text: L('fb_downloaded') });
  };

  const doIssue = async () => {
    if (!hasText) { setStatus({ kind: 'warn', text: L('fb_need_description') }); return; }
    let copied = false;
    if (report.truncated) copied = await copyText(report.publicMarkdown);
    CTSActivity.log('feedback', `Opened GitHub issue form (${CATEGORY_TITLE[category]})`);
    window.open(report.issueUrl, '_blank', 'noopener');
    setOpenedUrl(report.issueUrl);
    if (report.truncated)
      setStatus(copied ? { kind: 'warn', text: L('fb_truncated') } : { kind: 'warn', text: L('fb_copy_failed') });
    else
      setStatus({ kind: 'ok', text: L('fb_opened') });
  };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="fb-title" data-testid="feedback-dialog"
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.45)',
               display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 640, maxHeight: '100%', display: 'flex', flexDirection: 'column',
                 background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 10,
                 boxShadow: '0 8px 32px rgba(0,0,0,0.25)', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
          <h2 id="fb-title" style={{ fontFamily: 'var(--font-head)', fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>
            {L('fb_title')}
          </h2>
          <button aria-label={L('fb_close')} onClick={onClose}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text-muted)',
                     fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        {/* Body */}
        <div style={{ padding: '16px 20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ fontSize: 13, color: 'var(--text-dim)' }}>{L('fb_intro')}</p>

          <div>
            <div style={label}>{L('fb_category')}</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {CATEGORIES.map(c => (
                <button key={c} onClick={() => setCategory(c)} aria-pressed={category === c}
                  style={{ padding: '4px 12px', borderRadius: 5, cursor: 'pointer', fontSize: 12,
                           fontFamily: 'var(--font-body)', fontWeight: category === c ? 600 : 400,
                           background: category === c ? 'var(--accent-glow)' : 'var(--surface-2)',
                           color: category === c ? 'var(--accent)' : 'var(--text-dim)',
                           border: `1px solid ${category === c ? 'var(--accent)' : 'var(--border-2)'}` }}>
                  {L(`fb_cat_${c}`)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="fb-desc" style={{ ...label, display: 'block' }}>{L('fb_description')} *</label>
            <textarea id="fb-desc" ref={textRef} value={description} rows={6}
              onChange={e => { setDescription(e.target.value); setStatus(null); }}
              placeholder={L('fb_placeholder')}
              style={{ width: '100%', resize: 'vertical', background: 'var(--surface-2)', color: 'var(--text)',
                       border: '1px solid var(--border-2)', borderRadius: 6, padding: '8px 10px',
                       fontSize: 13, lineHeight: 1.5, outline: 'none' }} />
          </div>

          <div>
            <label htmlFor="fb-email" style={{ ...label, display: 'block' }}>{L('fb_email')}</label>
            <input id="fb-email" type="email" autoComplete="email" value={email} data-testid="feedback-email"
              onChange={e => { setEmail(e.target.value); setStatus(null); }}
              placeholder={L('fb_email_placeholder')} aria-invalid={!emailOk}
              style={{ width: '100%', background: 'var(--surface-2)', color: 'var(--text)',
                       border: `1px solid ${emailOk ? 'var(--border-2)' : 'var(--amber)'}`, borderRadius: 6,
                       padding: '7px 10px', fontSize: 13, outline: 'none' }} />
            <p style={{ fontSize: 11, color: emailOk ? 'var(--text-muted)' : 'var(--amber)', marginTop: 4 }}>
              {L(emailOk ? 'fb_email_hint' : 'fb_email_invalid')}
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, color: 'var(--text-dim)', cursor: 'pointer' }}>
              <input type="checkbox" checked={includeProject} onChange={e => setIncludeProject(e.target.checked)}
                style={{ marginTop: 3 }} />
              <span>{L('fb_include_project')}</span>
            </label>
            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, color: 'var(--text-dim)', cursor: 'pointer' }}>
              <input type="checkbox" checked={includeActivity} onChange={e => setIncludeActivity(e.target.checked)}
                style={{ marginTop: 3 }} />
              <span>
                {L('fb_include_activity')}{' '}
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: nErrors ? 'var(--red)' : 'var(--text-muted)' }}>
                  ({L('fb_activity_count').replace('{n}', entries.length).replace('{e}', nErrors)})
                </span>
              </span>
            </label>
            <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{L('fb_privacy')}</p>
          </div>

          <div>
            <button onClick={() => setPreview(p => !p)}
              style={{ background: 'none', border: 'none', padding: 0, color: 'var(--accent)', cursor: 'pointer',
                       fontSize: 12, fontFamily: 'var(--font-body)' }}>
              {preview ? L('fb_preview_hide') : L('fb_preview_show')}
            </button>
            {preview && (
              <pre data-testid="feedback-preview"
                style={{ marginTop: 8, maxHeight: 240, overflow: 'auto', background: 'var(--surface-2)',
                         border: '1px solid var(--border)', borderRadius: 6, padding: 10, fontSize: 11,
                         fontFamily: 'var(--font-mono)', color: 'var(--text-dim)', whiteSpace: 'pre-wrap',
                         wordBreak: 'break-word' }}>
                {report.markdown}
              </pre>
            )}
          </div>

          {status && (
            <div role="status" data-testid="feedback-status"
              style={{ fontSize: 12, padding: '8px 10px', borderRadius: 6,
                       background: status.kind === 'ok' ? 'var(--green-bg)' : 'var(--surface-3)',
                       color: status.kind === 'ok' ? 'var(--green)' : 'var(--amber)',
                       border: `1px solid ${status.kind === 'ok' ? 'var(--green)' : 'var(--amber)'}` }}>
              {status.text}
              {openedUrl && (
                <> {' '}<a href={openedUrl} target="_blank" rel="noopener noreferrer"
                     style={{ color: 'var(--accent)' }}>{L('fb_open_link')}</a></>
              )}
            </div>
          )}

          <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{L('fb_issue_hint')}</p>
        </div>

        {/* Footer */}
        <div style={{ borderTop: '1px solid var(--border)', padding: '12px 20px', display: 'flex', gap: 8,
                      flexWrap: 'wrap', justifyContent: 'flex-end', background: 'var(--surface-2)' }}>
          <button style={btn(false, false)} onClick={doDownload}>{L('fb_download')}</button>
          <button style={btn(false, false)} onClick={doCopy}>{L('fb_copy')}</button>
          {sendFailed && (
            <button style={btn(false, !hasText)} disabled={!hasText} onClick={doIssue}>{L('fb_create_issue')}</button>
          )}
          <button style={btn(true, !canSend)} disabled={!canSend} onClick={doSend} data-testid="feedback-send"
            title={hasText ? '' : L('fb_need_description')}>
            {L(sending ? 'fb_sending' : 'fb_send')}
          </button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { FeedbackDialog });
})();
