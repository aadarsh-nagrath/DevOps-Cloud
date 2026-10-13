# Asterisk, FreeSWITCH & Kamailio — Complete Notes

> Part of [`VoIP and Unified Communications/`](./). Prereq: [VoIP & SIP Fundamentals](./voip-sip-fundamentals.md).

## 1. Beginner: who does what

| | **Asterisk** | **FreeSWITCH** | **Kamailio** |
|---|---|---|---|
| Role | IP-PBX / B2BUA / media server | Softswitch / B2BUA / media server | **SIP proxy / registrar / load balancer** |
| Handles media (RTP)? | Yes | Yes | **No** (pair with **rtpengine**) |
| Strengths | PBX features, dialplan, IVR, voicemail, queues, huge community | High concurrency, conferencing, transcoding, multi-tenant, programmable via ESL | Very high CPS (thousands of calls/sec), routing, auth, security edge, NAT handling |
| Config | `/etc/asterisk/*.conf` (`pjsip.conf`, `extensions.conf`) | XML under `/etc/freeswitch` (or `/usr/local/freeswitch/conf`) | `/etc/kamailio/kamailio.cfg` (scripting language) |
| CLI | `asterisk -rvvv` | `fs_cli` | `kamcmd`, `kamctl` |
| APIs | AMI (TCP 5038), ARI (REST + WebSocket), AGI | ESL (Event Socket, TCP 8021), mod_xml_curl, Lua | RPC (JSON-RPC via `jsonrpcs`), `xhttp`, KEMI (Lua/Python scripting) |

**Typical production architecture:**
```
Carriers / SIP trunks / Phones / WebRTC
              │
        [ Kamailio ]  ← auth, security (pike/ratelimit), NAT fix, routing, dispatcher LB
        [ rtpengine ] ← media relay for NAT, SRTP⇄RTP, recording
         │        │
   [Asterisk]  [FreeSWITCH]  ← IVR, queues, conferencing, voicemail, recording (media)
              │
       DB (MySQL/Postgres), Redis, CDR store, HOMER (SIP capture), Prometheus/Grafana
```

---

## 2. Intermediate

### Asterisk

**Key files**
| File | Purpose |
|---|---|
| `pjsip.conf` | SIP endpoints, auth, AORs, transports, trunks (**`chan_pjsip`**; legacy `chan_sip` was removed in Asterisk 21) |
| `extensions.conf` | **Dialplan**: what happens when a number is dialed |
| `rtp.conf` | RTP port range (`rtpstart=10000`, `rtpend=20000`) |
| `logger.conf` | Log channels (`/var/log/asterisk/full`, `messages`) |
| `modules.conf`, `asterisk.conf`, `cdr*.conf`, `queues.conf`, `voicemail.conf` | Modules, core settings, CDRs, call queues, voicemail |

**Minimal PJSIP endpoint + NAT-friendly transport**
```ini
; pjsip.conf
[transport-udp]
type=transport
protocol=udp
bind=0.0.0.0:5060
external_media_address=203.0.113.10      ; public/Elastic IP
external_signaling_address=203.0.113.10
local_net=10.0.0.0/8

[1001]
type=endpoint
context=internal
disallow=all
allow=ulaw,alaw,opus
auth=1001-auth
aors=1001
direct_media=no          ; keep RTP through Asterisk (needed behind NAT)
rtp_symmetric=yes
force_rport=yes
rewrite_contact=yes
dtmf_mode=rfc4733

[1001-auth]
type=auth
auth_type=userpass
username=1001
password=ChangeMe-Strong!

[1001]
type=aor
max_contacts=1
qualify_frequency=30     ; OPTIONS keepalive/health
```

**Dialplan basics**
```ini
; extensions.conf
[internal]
exten => _1XXX,1,NoOp(Internal call to ${EXTEN})
 same => n,Dial(PJSIP/${EXTEN},30)
 same => n,VoiceMail(${EXTEN}@default,u)
 same => n,Hangup()

exten => _9NXXNXXXXXX,1,Dial(PJSIP/${EXTEN:1}@carrier-trunk,60)   ; strip leading 9
```
Patterns: `X` = 0–9, `Z` = 1–9, `N` = 2–9, `.` = one or more of anything.

**Daily CLI (`asterisk -rvvv`)**
| Command | Use |
|---|---|
| `core show channels [verbose]` | Active calls |
| `pjsip show endpoints` / `pjsip show endpoint 1001` | Endpoint state, contacts, registration |
| `pjsip show registrations` / `pjsip show contacts` | Outbound trunk regs / registered devices |
| `pjsip set logger on` | **Print full SIP messages** to the console |
| `rtp set debug on` | Print RTP packets (see whether media flows) |
| `core set verbose 5` / `core set debug 5` | More log detail |
| `dialplan show internal` / `dialplan reload` | Inspect/reload dialplan |
| `module reload res_pjsip.so` / `core reload` | Reload config |
| `core show uptime`, `core show sysinfo` | Health |
| `core stop gracefully` | Stop after current calls end (**use for maintenance**) |

### FreeSWITCH

**Key concepts**
- **Sofia** = the SIP stack (`mod_sofia`). **SIP profiles**: by default `internal` (port **5060**, registered users) and `external` (port **5080**, carriers/gateways).
- **Dialplan** is XML (contexts → extensions → conditions/actions), commonly extended with Lua.
- **Directory** = user accounts. **Gateways** = SIP trunks to carriers.
- **ESL** (Event Socket Library, port 8021) lets external apps (Python/Node/Go) control calls; very common in custom UC platforms.
- Strong at **conferencing** (`mod_conference`), recording, transcoding, and WebRTC (`mod_verto` or SIP over WSS).

**Daily CLI (`fs_cli`)**
| Command | Use |
|---|---|
| `sofia status` | All profiles and gateways and their state |
| `sofia status profile internal reg` | Registered users |
| `sofia status gateway <name>` | Trunk state (REGED / FAIL_WAIT…) |
| `sofia global siptrace on` | Print SIP messages |
| `sofia loglevel all 9` | Very verbose SIP stack logs |
| `show channels` / `show calls` | Active channels/calls |
| `reloadxml` / `reload mod_sofia` | Reload config |
| `sofia profile internal restart` | Restart a profile (**drops its calls**; avoid in peak hours) |
| `fsctl shutdown elegant` | Graceful shutdown after calls finish |
| `uuid_kill <uuid>` | Kill a stuck call |

Example dialplan snippet:
```xml
<extension name="local_ext">
  <condition field="destination_number" expression="^(1\d{3})$">
    <action application="bridge" data="user/$1@${domain_name}"/>
  </condition>
</extension>
```

### Kamailio

**What it does:** high-performance SIP **proxy/registrar/LB/security edge**. It routes signaling, but media goes elsewhere (endpoints directly or via rtpengine).

**Important modules**
| Module | Job |
|---|---|
| `tm` / `sl` | Stateful / stateless transaction handling |
| `rr` | Record-Route / loose routing |
| `registrar` + `usrloc` | Registration and the location table |
| `auth` + `auth_db` | Digest authentication against a DB |
| `dispatcher` | **Load balancing** to Asterisk/FreeSWITCH pools with health probing (OPTIONS) |
| `nathelper` | NAT detection/fixing, keepalives |
| `rtpengine` | Control the rtpengine media relay |
| `pike`, `ratelimit`, `htable` | Flood detection, rate limiting, in-memory tables (IP bans) |
| `permissions` | IP ACLs for trunks |
| `dialog` | Track active calls (concurrency limits) |
| `dmq` | Replicate state (usrloc/htable) between Kamailio nodes |
| `xhttp_prom` / `jsonrpcs` | Prometheus metrics / RPC |

**Routing script skeleton (`kamailio.cfg`)**
```c
request_route {
    if (!mf_process_maxfwd_header("10")) { sl_send_reply("483","Too Many Hops"); exit; }
    if (!pike_check_req()) { exit; }                 # drop flooders
    if (has_totag()) { if (loose_route()) { t_relay(); exit; } }   # in-dialog requests
    if (is_method("REGISTER")) {
        if (!auth_check("$fd", "subscriber", "1")) { auth_challenge("$fd", "0"); exit; }
        fix_nated_register(); save("location"); exit;
    }
    if (is_method("INVITE")) {
        record_route();
        if (!ds_select_dst("1", "4")) { sl_send_reply("503","No Media Servers"); exit; }  # dispatcher set 1, round-robin
        rtpengine_manage();
        t_relay(); exit;
    }
}
```

**Daily CLI**
| Command | Use |
|---|---|
| `kamcmd dispatcher.list` | Backend pool state (AP = active+probing, IP = inactive) |
| `kamcmd dispatcher.reload` | Reload dispatcher list |
| `kamctl ul show` / `kamcmd ul.dump` | Registered users |
| `kamcmd core.uptime`, `kamcmd stats.get_statistics all` | Health and counters |
| `kamcmd tm.stats` / `kamcmd dlg.stats_active` | Transactions / active dialogs |
| `kamailio -c -f /etc/kamailio/kamailio.cfg` | **Syntax-check config before restart** |

### rtpengine (media relay)
A kernel-accelerated RTP proxy driven by Kamailio/OpenSIPS. It anchors media on a public IP (NAT fix), bridges SRTP⇄RTP and WebRTC⇄SIP, can record calls, and exports per-call quality stats. It's typically installed on nodes with a public IP and a big UDP port range open.

---

## 3. Advanced: operating them in production

### Health & monitoring
- **Health checks**: SIP `OPTIONS` from Kamailio dispatcher to every media server, from monitoring (`sipsak`, `sipp`, or a Nagios/Prometheus blackbox SIP probe) to every public endpoint, and `qualify` toward trunks.
- **Metrics**: active channels, CPS, registrations, response code counts (4xx/5xx), dispatcher destination state, rtpengine sessions/packet loss, and CPU/network. Kamailio has `xhttp_prom`, rtpengine has a Prometheus endpoint, and Asterisk/FreeSWITCH have community exporters or can be scraped via AMI/ESL.
- **Logs**: centralize `/var/log/asterisk/full`, FreeSWITCH `freeswitch.log`, and Kamailio syslog into ELK/Loki, always including the **Call-ID** for correlation.
- **SIP capture**: HOMER (HEP agents are built into Kamailio, FreeSWITCH, Asterisk, and rtpengine).

### Safe changes and releases
- Always **syntax-check** first: `kamailio -c`, `asterisk -rx "dialplan reload"` in staging first, `fs_cli -x reloadxml`.
- **Reloads beat restarts** wherever possible; restarts drop live calls.
- For maintenance: remove the node from the dispatcher set (`kamcmd dispatcher.set_state ip 1 sip:10.0.1.5:5060`) or let OPTIONS fail it, wait for active channels to drain to 0, then patch or upgrade.
- Manage configs in **Git + Ansible** (templated `pjsip.conf`, `kamailio.cfg`, dispatcher lists), and test with **SIPp** load and call-flow scenarios in CI.

### Common production issues
| Issue | Where to look |
|---|---|
| Trunk down / outbound calls fail with 503 | `pjsip show registrations`, `sofia status gateway`, carrier IP whitelisting, DNS SRV of the carrier |
| `403` on outbound | Wrong credentials, carrier hasn't whitelisted your public IP, caller ID format rejected |
| `488` | Codec mismatch; check `allow=` lists and SDP |
| Calls stuck / "zombie" channels | Missing BYE (NAT), session timers, RTP timeout settings (`rtp_timeout` / `media-timeout`) |
| High CPU on media server | Transcoding (G.729/Opus⇄G.711), conferencing, recording; scale out or avoid transcoding |
| Registration storms after network blip | Thousands of phones re-register at once; use randomized expiry and Kamailio rate limiting |
