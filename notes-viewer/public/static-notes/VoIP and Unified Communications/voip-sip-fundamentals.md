# VoIP & SIP Fundamentals — Complete Notes

> Part of [`VoIP and Unified Communications/`](./). Next: [Asterisk, FreeSWITCH & Kamailio](./asterisk-freeswitch-kamailio.md) → [Troubleshooting with Wireshark](./voip-troubleshooting-wireshark.md) → [VoIP on AWS & Kubernetes](./voip-on-aws-and-kubernetes.md). Interview prep: [VoIP Q&A](../Interview%20Questions/21-voip-sip-unified-communications-qna.md).

## 1. Beginner

### What is VoIP?
**Voice over IP** carries voice as packets over an IP network instead of a dedicated circuit (PSTN). Every VoIP call has two separate planes, and almost every VoIP troubleshooting problem is about keeping them straight:

| Plane | Protocol | Job | Typical ports |
|---|---|---|---|
| **Signaling** | **SIP** (Session Initiation Protocol) | Set up, modify, and tear down the call ("who, where, which codec") | UDP/TCP **5060**, TLS **5061** |
| **Media** | **RTP** (Real-time Transport Protocol) + **RTCP** (control/stats) | Carry the actual audio/video packets | A UDP range: Asterisk default **10000–20000**, FreeSWITCH default **16384–32768** |

**Key insight:** signaling and media usually take **different paths and different ports**. A call can "connect" perfectly (SIP works) and still have no audio (RTP blocked or sent to the wrong IP), which is the classic **one-way / no audio** problem.

### Unified Communications (UC)
UC is voice, video, conferencing, chat/presence, voicemail, IVR, and contact-center features delivered on one platform. Under the hood it's still mostly SIP + RTP (plus WebRTC for browsers).

### Key VoIP terms
| Term | Meaning |
|---|---|
| **PSTN** | The traditional public phone network |
| **SIP trunk** | A SIP connection to a carrier/ITSP that lets your platform make and receive PSTN calls |
| **DID** | Direct Inward Dialing number: a real phone number routed to your system |
| **PBX / IP-PBX** | Private branch exchange: extensions, dialplan, voicemail, IVR (e.g. **Asterisk**, **FreeSWITCH**) |
| **SIP proxy** | Routes SIP messages, usually without touching media (e.g. **Kamailio**, OpenSIPS) |
| **B2BUA** | Back-to-back user agent: terminates one call leg and originates a new one, so it fully controls both legs (Asterisk and FreeSWITCH are B2BUAs) |
| **SBC** | Session Border Controller: the security and NAT edge between your network and carriers or the internet |
| **UA / UAC / UAS** | User agent (any SIP endpoint); UAC sends requests, UAS answers them |
| **Registrar** | Stores "user X is currently reachable at IP:port" (from `REGISTER`) |
| **Codec** | Encodes and compresses audio (G.711, G.729, Opus…) |
| **IVR** | Interactive Voice Response ("press 1 for sales") |
| **CDR** | Call Detail Record: who called whom, when, how long, and the result |

### SIP methods (requests)
| Method | Purpose |
|---|---|
| `REGISTER` | Phone tells the registrar where it can be reached |
| `INVITE` | Start a call (or re-INVITE to modify it: hold, codec change) |
| `ACK` | Confirms the final response to an INVITE (completes the 3-way handshake) |
| `BYE` | Hang up an established call |
| `CANCEL` | Cancel an INVITE that hasn't been answered yet |
| `OPTIONS` | Capability query; widely used as a **health-check/keepalive ping** |
| `PRACK`, `UPDATE` | Reliable provisional responses; modify a session before answer |
| `INFO` | Mid-call info (sometimes used for DTMF) |
| `REFER` | Call transfer |
| `SUBSCRIBE` / `NOTIFY` | Event subscriptions (presence, voicemail waiting indicator, BLF) |
| `MESSAGE` | Instant message |

### SIP response codes (HTTP-like)
| Class | Common codes |
|---|---|
| **1xx Provisional** | `100 Trying`, `180 Ringing`, `183 Session Progress` (early media, e.g. ringback tone from the carrier) |
| **2xx Success** | `200 OK` |
| **3xx Redirect** | `301`/`302 Moved` |
| **4xx Client error** | `401 Unauthorized` / `407 Proxy Authentication Required` (normal auth challenge), `403 Forbidden` (bad credentials, IP not allowed), `404 Not Found` (unknown number/user), `408 Request Timeout`, `480 Temporarily Unavailable` (user not registered), `486 Busy Here`, `487 Request Terminated` (caller cancelled), `488 Not Acceptable Here` (**codec/SDP mismatch**) |
| **5xx Server error** | `500 Server Internal Error`, `503 Service Unavailable` (overloaded, or no route/trunk down) |
| **6xx Global failure** | `603 Decline` |

> A `401`/`407` followed by a re-sent request with an `Authorization` header is **normal digest authentication**, not an error.

---

## 2. Intermediate

### A basic call flow (A calls B through a proxy)
```
 Alice (UAC)            Proxy/PBX             Bob (UAS)
    | --- INVITE (SDP offer) ---> |                      |
    | <-- 100 Trying ------------ | --- INVITE --------> |
    |                             | <-- 180 Ringing ---- |
    | <-- 180 Ringing ----------- |                      |
    |                             | <-- 200 OK (SDP ans) |
    | <-- 200 OK (SDP answer) --- |                      |
    | --- ACK ------------------> | --- ACK -----------> |
    | <========== RTP audio (both directions) =========> |
    | --- BYE ------------------> | --- BYE -----------> |
    | <-- 200 OK ---------------- | <-- 200 OK --------- |
```
- **INVITE → 200 OK → ACK** is a three-way handshake. If the `ACK` never arrives, the callee keeps retransmitting `200 OK` and gives up after **~32 seconds** (64×T1, T1 = 500 ms). That's the famous **"call drops after 30–32 seconds"** symptom, almost always caused by NAT or wrong `Contact`/`Record-Route` headers so the ACK goes to the wrong place.
- RTP flows **directly between endpoints** unless a B2BUA or media relay sits in the media path.

### Important SIP headers
| Header | Why you care |
|---|---|
| `Via` | Path of the request; responses retrace it. `branch` identifies the transaction; `received`/`rport` record the real source IP/port (NAT) |
| `From` / `To` | Logical caller and callee (with `tag` parameters) |
| `Call-ID` | Unique ID of the call. **This is what you filter on when troubleshooting** |
| `CSeq` | Sequence number + method; orders transactions within a dialog |
| `Contact` | The address where the UA wants future requests sent. **Private IP here = NAT problems** |
| `Record-Route` / `Route` | Lets proxies stay in the signaling path for the whole dialog |
| `Max-Forwards` | Loop protection (like IP TTL) |
| `User-Agent` / `Server` | Device/software identity, useful for spotting scanners like `friendly-scanner` |
| `Authorization` / `WWW-Authenticate` | Digest authentication |

A **dialog** (one call) = `Call-ID` + From-tag + To-tag. A **transaction** = one request plus its responses (identified by the Via `branch`).

### SDP: how the media is negotiated
SIP carries an **SDP** (Session Description Protocol) body using the **offer/answer** model:
```
v=0
o=- 4242 4242 IN IP4 203.0.113.10
s=call
c=IN IP4 203.0.113.10          <- IP where I want to RECEIVE media
t=0 0
m=audio 14000 RTP/AVP 0 8 101  <- port + offered payload types
a=rtpmap:0 PCMU/8000
a=rtpmap:8 PCMA/8000
a=rtpmap:101 telephone-event/8000
a=fmtp:101 0-16
a=ptime:20
a=sendrecv                      <- sendonly/recvonly/inactive used for hold
```
- `c=` and `m=` tell the other side **where to send RTP**. If `c=` contains a private IP (10.x/172.16–31.x/192.168.x) and the call crosses the internet, the result is **one-way or no audio**.
- If there's **no common codec**, the answerer responds `488 Not Acceptable Here`.

### Codecs
| Codec | Payload type | Bitrate | Notes |
|---|---|---|---|
| **G.711 μ-law (PCMU)** | 0 | 64 kbps (~87 kbps on the wire with IP/UDP/RTP overhead at 20 ms) | Uncompressed, best quality, North America/Japan |
| **G.711 A-law (PCMA)** | 8 | 64 kbps | Rest of the world |
| **G.729** | 18 | 8 kbps | Low bandwidth, slightly lower quality |
| **G.722** | 9 | 64 kbps | Wideband ("HD voice") |
| **Opus** | dynamic | 6–510 kbps adaptive | Modern, WebRTC default, resilient to packet loss |

**Transcoding** (converting between codecs) costs CPU on the PBX. Prefer a common codec end to end.

### DTMF (keypad tones)
| Method | How it's sent |
|---|---|
| **RFC 4733 / RFC 2833** | As special RTP events (`telephone-event`). **The standard and most reliable** |
| **SIP INFO** | As SIP messages |
| **In-band** | As actual audio tones; breaks with compressed codecs like G.729 |

"IVR doesn't recognize key presses" is usually a **DTMF mode or payload-type mismatch** between the two legs.

### RTP and RTCP
- **RTP** packet headers carry a **sequence number** (to detect loss/reordering), a **timestamp** (to measure jitter), and an **SSRC** (stream ID).
- **RTCP** (traditionally RTP port +1, or multiplexed with `rtcp-mux`) sends periodic quality reports: packet loss, jitter, and round-trip time.

### Voice quality metrics
| Metric | Target | Effect when bad |
|---|---|---|
| **Latency** (one-way, mouth-to-ear) | < 150 ms (ITU-T G.114) | People talk over each other |
| **Jitter** (variation in packet arrival) | < 30 ms | Choppy/robotic audio; jitter buffer adds delay |
| **Packet loss** | < 1% | Gaps, clipping, robotic voice |
| **MOS** (Mean Opinion Score, 1–5) | ≥ 4.0 good; G.711 tops out ~4.4 | Overall perceived quality |

Related call-level KPIs: **ASR** (Answer Seizure Ratio, % of calls answered), **ACD** (Average Call Duration), **PDD** (Post-Dial Delay, time from dialing to ringing), and **NER** (Network Effectiveness Ratio).

---

## 3. Advanced

### NAT: the #1 source of VoIP problems
SIP puts IP addresses **inside the message body** (Via, Contact, SDP `c=`). NAT only rewrites packet headers, so the far end gets told to send traffic to an unreachable private IP.

| Symptom | Typical NAT cause |
|---|---|
| One-way audio | SDP advertises a private IP, or the RTP ports aren't open/forwarded |
| No audio either way | RTP range blocked by firewall/Security Group |
| Call drops at ~32 s | ACK sent to private `Contact` and lost |
| Inbound calls fail after a few minutes | NAT binding expired, so the registered address is stale |
| Random weirdness | **SIP ALG** on a router rewriting packets badly. **Disable SIP ALG** |

Fixes:
- **Server side**: tell the PBX its public address and which networks are local. In Asterisk PJSIP use `external_media_address`, `external_signaling_address`, and `local_net`; in FreeSWITCH use `ext-rtp-ip` / `ext-sip-ip`. Enable **symmetric RTP and rport** (send media back to where it actually came from: Asterisk `rtp_symmetric=yes`, `force_rport=yes`, `rewrite_contact=yes`, `direct_media=no`).
- **Proxy side**: Kamailio's `nathelper` (`fix_nated_contact()`, `fix_nated_register()`) plus a media relay (**rtpengine**) that anchors RTP on a public IP.
- **Client side**: **STUN** (discover own public IP), **TURN** (relay media when direct fails), **ICE** (try candidates and pick the best path; mandatory in WebRTC).
- **Keepalives**: short registration expiry or SIP `OPTIONS` / CRLF pings to keep NAT bindings open.

### Security
- **Toll fraud** is the big one: attackers brute-force SIP credentials and pump premium-rate international calls, which can cost thousands overnight. Mitigate with strong passwords, IP ACLs on trunks, **fail2ban** on SIP auth failures, Kamailio `pike` (flood detection) and `ratelimit`, international/premium dial restrictions, and spend/concurrency limits per account.
- **Scanners** (SIPVicious, `User-Agent: friendly-scanner`) constantly probe port 5060. Don't expose it to the world unnecessarily; put an SBC or Kamailio in front.
- **Encryption**: **SIP over TLS** (5061) protects signaling; **SRTP** protects media (keys via SDES `a=crypto` in TLS-protected SDP, or **DTLS-SRTP** in WebRTC).
- **Caller ID spoofing**: in the US, **STIR/SHAKEN** signs caller ID attestation.
- **DoS**: SIP floods. Use rate limiting at the edge, separate signaling from management networks, and don't log every failed REGISTER synchronously.

### WebRTC
Browser-based real-time media: SIP over **WebSocket** (WSS) for signaling, mandatory **DTLS-SRTP** for media, **ICE/STUN/TURN** for NAT traversal, and Opus as the default codec. Kamailio (`websocket` module), Asterisk, and FreeSWITCH (`mod_verto` / WSS) can all act as WebRTC gateways.

### Scaling & HA patterns
- **Kamailio in front** as a stateless/transaction-stateful SIP load balancer (`dispatcher` module with health probing via OPTIONS), **Asterisk/FreeSWITCH behind** as media servers doing IVR, conferencing, and recording.
- **rtpengine** for media relay/NAT/transcoding-lite/recording at scale.
- **HA**: active/standby with a floating IP (keepalived/VRRP, or AWS Elastic IP reassignment); shared registration state (Kamailio `usrloc` in a DB or replicated with `DMQ`); and graceful draining (stop new calls, let existing calls finish; calls can last hours).
- **Capacity planning**: concurrent calls, CPS (calls per second), codec/transcoding CPU, and bandwidth (~87 kbps per G.711 call per direction).

### Observability for voice platforms
- **Signaling capture**: `sngrep` (live, terminal), **HOMER/HEP** (central SIP capture and search across all servers).
- **Health**: SIP `OPTIONS` pings to every node and trunk, registration counts, active channels, CPS, and failed-call ratios by response code (spikes of 503/408/488 are early warnings).
- **Quality**: RTCP stats, MOS/jitter/loss per call, CDR-based ASR/ACD dashboards in Grafana.
- **Alert ideas**: trunk down (OPTIONS failing), ASR drop, 5xx ratio rising, registrations dropping sharply, RTP port exhaustion, SIP auth-failure spike (fraud attempt).
