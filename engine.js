(function (root) {
  'use strict';
  // Email header reader: unfolding, RFC 2047 encoded words, address lists, RFC 5322 dates, RFC 2231 parameters.
  function unfold(raw) {
    var lines = String(raw).split(/\r\n|\n|\r/), out = [], cur = null, i;
    for (i = 0; i < lines.length; i++) {
      var l = lines[i];
      if (l === '') break;
      if ((l[0] === ' ' || l[0] === '\t') && cur) cur.value += l;      // keep the whitespace; RFC 5322 unfolding removes only the line break
      else { var c = l.indexOf(':'); if (c <= 0) { cur = null; out.push({ name: null, value: l, bad: true }); continue; } cur = { name: l.slice(0, c).trim(), value: l.slice(c + 1).replace(/^[ \t]/, '') }; out.push(cur); }
    }
    return out;
  }
  function dec(cs, bytes) {
    try { return new TextDecoder(cs.toLowerCase(), { fatal: false }).decode(Uint8Array.from(bytes)); } catch (e) { return null; }
  }
  function qBytes(t) { var b = [], i; for (i = 0; i < t.length; i++) { var c = t[i]; if (c === '_') b.push(32); else if (c === '=' && /^[0-9a-fA-F]{2}$/.test(t.substr(i + 1, 2))) { b.push(parseInt(t.substr(i + 1, 2), 16)); i += 2; } else b.push(t.charCodeAt(i) & 255); } return b; }
  function bBytes(t) { try { var s = atob(t.replace(/\s+/g, '')); var b = []; for (var i = 0; i < s.length; i++) b.push(s.charCodeAt(i)); return b; } catch (e) { return null; } }
  // returns {text, words:[{raw,charset,enc,ok}]}
  function decodeWords(v) {
    var re = /=\?([^?\s]+)\?([QqBb])\?([^?\s]*)\?=/g, out = '', last = 0, m, words = [], prevEnd = -1;
    while ((m = re.exec(v))) {
      var gap = v.slice(last, m.index), cs = m[1].split('*')[0], bytes = /^[Qq]$/.test(m[2]) ? qBytes(m[3]) : bBytes(m[3]), txt = bytes ? dec(cs, bytes) : null;
      if (prevEnd === last && /^\s*$/.test(gap) && words.length && words[words.length - 1].ok) gap = '';   // whitespace between adjacent encoded words is dropped
      out += gap;
      if (txt === null) { out += m[0]; words.push({ raw: m[0], charset: cs, enc: m[2].toUpperCase(), ok: false }); }
      else { out += txt; words.push({ raw: m[0], charset: cs, enc: m[2].toUpperCase(), ok: true }); }
      last = m.index + m[0].length; prevEnd = last;
    }
    out += v.slice(last);
    return { text: out, words: words };
  }
  function splitTop(s, sep) {
    var out = [], cur = '', q = false, depth = 0, ang = false, i, c;
    for (i = 0; i < s.length; i++) {
      c = s[i];
      if (c === '\\' && (q || depth)) { cur += c + (s[++i] || ''); continue; }
      if (c === '"' && !depth) q = !q;
      else if (!q && c === '(') depth++;
      else if (!q && c === ')' && depth) depth--;
      else if (!q && !depth && c === '<') ang = true;
      else if (!q && !depth && c === '>') ang = false;
      if (c === sep && !q && !depth && !ang) { out.push(cur); cur = ''; } else cur += c;
    }
    out.push(cur); return out;
  }
  function unq(s) { return s.replace(/^"(.*)"$/s, '$1').replace(/\\(.)/g, '$1'); }
  function parseAddr(item) {
    var s = item.trim(), name = '', addr = '', m, comment = null;
    if (!s) return null;
    s = s.replace(/\(((?:[^()\\]|\\.)*)\)/g, function (x, c) { comment = c; return ' '; }).trim();   // comments are dropped from the address
    if ((m = /^(.*?)<([^<>]*)>\s*$/s.exec(s))) { name = unq(m[1].trim()); addr = m[2].trim().replace(/^.*:/, ''); }
    else { addr = unq(s); if (comment !== null) name = comment; }   // legacy "addr (Name)" style: the comment is shown as the name, like Python's parseaddr
    return { name: name, addr: addr, comment: comment };
  }
  function parseAddressList(v) { return splitTop(v, ',').map(parseAddr).filter(Boolean); }
  var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MON = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  function parseDate(v) {
    var s = v.replace(/\([^)]*\)/g, ' ').trim(), m = /^(?:([A-Za-z]{3}),\s*)?(\d{1,2})\s+([A-Za-z]{3})\s+(\d{2,4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([+-]\d{4}|[A-Za-z]{1,5})?$/.exec(s);
    if (!m) return { ok: false, error: 'Not an RFC 5322 date (expected like "Mon, 05 Oct 2026 04:41:00 +0300").' };
    var mo = MON.indexOf(m[3].toLowerCase()); if (mo < 0) return { ok: false, error: 'Unknown month "' + m[3] + '".' };
    var y = +m[4]; if (m[4].length === 2) y += y < 50 ? 2000 : 1900; else if (m[4].length === 3) y += 1900;
    var off = 0, tz = m[8] || '';
    if (/^[+-]\d{4}$/.test(tz)) off = (tz[0] === '-' ? -1 : 1) * (+tz.slice(1, 3) * 60 + +tz.slice(3));
    else if (/^(UT|GMT|Z)$/i.test(tz)) off = 0; else if (tz) return { ok: true, unknownTz: tz, y: y, mo: mo, d: +m[2], h: +m[5], mi: +m[6], s: +(m[7] || 0), wd: m[1] || null };
    var ms = Date.UTC(y, mo, +m[2], +m[5], +m[6], +(m[7] || 0)) - off * 60000, dt = new Date(Date.UTC(y, mo, +m[2]));
    var valid = dt.getUTCMonth() === mo && dt.getUTCDate() === +m[2];
    if (!valid) return { ok: false, error: 'No such day: ' + m[2] + ' ' + m[3] + ' ' + y + '.' };
    var realWd = DAYS[dt.getUTCDay()];
    return { ok: true, utcMs: ms, iso: new Date(ms).toISOString().replace('.000Z', 'Z'), offMin: off, tz: tz, local: y + '-' + ('0' + (mo + 1)).slice(-2) + '-' + ('0' + m[2]).slice(-2) + 'T' + ('0' + m[5]).slice(-2) + ':' + m[6] + ':' + ('0' + (m[7] || 0)).slice(-2), wd: m[1] || null, realWd: realWd, wdMismatch: !!m[1] && m[1].toLowerCase() !== realWd.toLowerCase() };
  }
  function pctBytes(t) { var b = [], i; for (i = 0; i < t.length; i++) { if (t[i] === '%' && /^[0-9a-fA-F]{2}$/.test(t.substr(i + 1, 2))) { b.push(parseInt(t.substr(i + 1, 2), 16)); i += 2; } else b.push(t.charCodeAt(i) & 255); } return b; }
  // Parameters: "type/sub; k=v; k*=cs'lang'pct; k*0*=...; k*1=..." (RFC 2231)
  function parseParams(v) {
    var parts = splitTop(v, ';'), main = parts.shift().trim(), raw = {}, order = [];
    parts.forEach(function (p) { var e = p.indexOf('='); if (e < 0) return; var k = p.slice(0, e).trim().toLowerCase(), val = p.slice(e + 1).trim(); raw[k] = unq(val); order.push(k); });
    var base = {}, res = {}, k;
    order.forEach(function (k) { var m = /^([^*]+)(?:\*(\d+))?(\*)?$/.exec(k); if (!m) { res[k] = raw[k]; return; } var b = m[1]; (base[b] = base[b] || []).push({ idx: m[2] === undefined ? -1 : +m[2], enc: !!m[3], val: raw[k], star: m[3] === '*', hasIdx: m[2] !== undefined }); });
    Object.keys(base).forEach(function (b) {
      var segs = base[b].sort(function (x, y) { return x.idx - y.idx; }), cs = null, bytes = [], plain = '', anyEnc = false, ok = true, first = true;
      segs.forEach(function (sg) {
        var val = sg.val;
        if (sg.enc) {
          anyEnc = true;
          if (first) { var m = /^([^']*)'([^']*)'(.*)$/.exec(val); if (m) { cs = m[1] || 'us-ascii'; val = m[3]; } else cs = cs || 'us-ascii'; }
          bytes = bytes.concat(pctBytes(val));
        } else { if (bytes.length || anyEnc) { bytes = bytes.concat(Array.from(unescape(encodeURIComponent(val))).map(function (c) { return c.charCodeAt(0); })); } else plain += val; }
        first = false;
      });
      if (anyEnc) { var t = dec(cs || 'utf-8', bytes); res[b] = t === null ? plain : plain + t; res[b + '__charset'] = cs; } else res[b] = plain;
    });
    return { main: main.toLowerCase(), params: res };
  }
  function domainOf(a) { var i = a.lastIndexOf('@'); return i < 0 ? '' : a.slice(i + 1).toLowerCase().replace(/>$/, ''); }
  function analyze(raw) {
    var hs = unfold(raw), by = {}, notes = [];
    hs.forEach(function (h) { if (h.name) (by[h.name.toLowerCase()] = by[h.name.toLowerCase()] || []).push(h); });
    var out = { headers: hs, decoded: {}, addrs: {}, notes: notes };
    ['subject', 'comments', 'thread-topic'].forEach(function (k) { if (by[k]) out.decoded[k] = decodeWords(by[k][0].value); });
    ['from', 'to', 'cc', 'bcc', 'reply-to', 'sender', 'return-path'].forEach(function (k) {
      if (!by[k]) return; var list = parseAddressList(decodeWordsInPhrases(by[k][0].value));
      out.addrs[k] = list;
    });
    if (by.date) out.date = parseDate(by.date[0].value);
    if (by['content-type']) out.ctype = parseParams(by['content-type'][0].value);
    if (by['content-disposition']) out.cdisp = parseParams(by['content-disposition'][0].value);
    var f = out.addrs.from && out.addrs.from[0], rp = out.addrs['reply-to'] && out.addrs['reply-to'][0], ret = out.addrs['return-path'] && out.addrs['return-path'][0];
    if (by.from && by.from.length > 1) notes.push({ lvl: 'warn', msg: 'More than one From header. Only one is allowed.' });
    if (!by.from) notes.push({ lvl: 'warn', msg: 'No From header.' });
    if (!by['message-id']) notes.push({ lvl: 'info', msg: 'No Message-ID header. Receiving servers usually add one; its absence is a spam signal.' });
    if (f && f.name && /@/.test(f.name)) { var nd = (/[\w.+-]+@([\w.-]+)/.exec(f.name) || [])[1]; if (nd && nd.toLowerCase() !== domainOf(f.addr)) notes.push({ lvl: 'warn', msg: 'The display name contains an address at ' + nd + ' but the real address is at ' + domainOf(f.addr) + '. A common spoofing trick.' }); }
    if (f && rp && domainOf(rp.addr) && domainOf(rp.addr) !== domainOf(f.addr)) notes.push({ lvl: 'info', msg: 'Reply-To goes to ' + domainOf(rp.addr) + ', not the From domain ' + domainOf(f.addr) + '. Legitimate for mailing lists, also used in phishing.' });
    if (f && ret && ret.addr && domainOf(ret.addr) !== domainOf(f.addr)) notes.push({ lvl: 'info', msg: 'Return-Path domain (' + domainOf(ret.addr) + ') differs from the From domain (' + domainOf(f.addr) + '). Normal for bulk senders; it matters for SPF and DMARC alignment.' });
    if (out.date && out.date.ok && out.date.wdMismatch) notes.push({ lvl: 'warn', msg: 'Date says ' + out.date.wd + ' but ' + out.date.local.slice(0, 10) + ' was a ' + out.date.realWd + '.' });
    if (by.subject) Object.keys(out.decoded).forEach(function () { }); 
    if (out.decoded.subject && out.decoded.subject.words.some(function (w) { return !w.ok; })) notes.push({ lvl: 'warn', msg: 'An encoded word in Subject could not be decoded (unknown charset or bad data). It is shown as written.' });
    hs.forEach(function (h) { if (h.bad) notes.push({ lvl: 'warn', msg: 'Line without a colon: "' + h.value.slice(0, 50) + '". It is not a valid header line.' }); });
    return out;
  }
  function decodeWordsInPhrases(v) { return v.replace(/=\?[^?\s]+\?[QqBb]\?[^?\s]*\?=(?:\s+=\?[^?\s]+\?[QqBb]\?[^?\s]*\?=)*/g, function (m) { return decodeWords(m).text.replace(/"/g, '\\"').replace(/^(.*[,;<>@()].*)$/s, '"$1"'); }); }
  var api = { unfold: unfold, decodeWords: decodeWords, parseAddressList: parseAddressList, parseDate: parseDate, parseParams: parseParams, analyze: analyze };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.HeadWhy = api;
})(typeof window !== 'undefined' ? window : this);
