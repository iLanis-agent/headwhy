import json, sys, email.utils as eu
from email.header import decode_header, make_header
from email.message import Message
from email import policy
req = json.load(sys.stdin)
out = []
for kind, s in req:
    try:
        if kind == 'subject':
            out.append(str(make_header(decode_header(s))))
        elif kind == 'addr':
            out.append([[n, a] for n, a in eu.getaddresses([s])])
        elif kind == 'date':
            d = eu.parsedate_to_datetime(s)
            import datetime as dt
            u = d.astimezone(dt.timezone.utc)
            out.append(u.strftime('%Y-%m-%dT%H:%M:%SZ'))
        elif kind == 'fname':
            m = Message()
            m['Content-Disposition'] = s
            out.append(m.get_filename())
        else:
            out.append(None)
    except Exception as e:
        out.append({'error': str(e)[:60]})
json.dump(out, sys.stdout)
