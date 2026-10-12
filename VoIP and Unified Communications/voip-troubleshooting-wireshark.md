# VoIP Troubleshooting with Wireshark, tcpdump & sngrep — Complete Notes

> Part of [`VoIP and Unified Communications/`](./). Prereq: [VoIP & SIP Fundamentals](./voip-sip-fundamentals.md).

## 1. Beginner: capture first, then analyze

### Capturing on a Linux server
```bash
# Capture SIP + the RTP range on all interfaces, full packets, to a file
sudo tcpdump -i any -n -s 0 -w /tmp/call.pcap 'port 5060 or port 5061 or portrange 10000-20000'

# Rotating capture for intermittent issues (10 files x 100MB)
sudo tcpdump -i any -n -s 0 -C 100 -W 10 -w /tmp/voip.pcap 'udp port 5060 or udp portrange 10000-20000'

# Quick look at SIP in the terminal (no Wireshark needed)
sudo tcpdump -i any -n -A -s 0 'port 5060'
```
Copy the `.pcap` locally (`scp`) and open it in **Wireshark**.

### sngrep: the fastest SIP troubleshooting tool
```bash
sudo sngrep                      # live: list of calls, Enter = ladder diagram
sudo sngrep -d any port 5060     # specific filter
sngrep -I /tmp/call.pcap         # read a capture
sudo sngrep -O /tmp/out.pcap     # save while watching
```
It shows every dialog with From/To and state; open one to see the call-flow arrows and the full SIP message, including SDP. **F2** saves, **F7** filters.

### Built-in server debug
- Asterisk: `pjsip set logger on`, `rtp set debug on`
- FreeSWITCH: `sofia global siptrace on`, `sofia loglevel all 9`
- Kamailio: `xlog()` lines in the script, `debug` level, `siptrace` module/HOMER

---

## 2. Intermediate: Wireshark for VoIP

### Most useful display filters
| Filter | Shows |
|---|---|
| `sip` | All SIP |
| `sip.Method == "INVITE"` | Call attempts |
| `sip.Method == "REGISTER"` | Registrations |
| `sip.Status-Code >= 400` | **Failures** |
| `sip.Status-Code == 488` | Codec mismatches |
| `sip.Call-ID == "abc123@10.0.0.5"` | **One call's signaling** |
| `sip.from.user == "1001"` | Calls from one extension |
| `rtp` / `rtcp` | Media / media statistics |
| `rtp.ssrc == 0x1234abcd` | One RTP stream |
| `rtp.marker == 1` | Talk-spurt starts |
| `udp.port == 5060 && ip.addr == 198.51.100.7` | SIP with one carrier |
| `sdp.connection_info` | SDP connection lines (look for private IPs) |

### The Telephony menu
- **Telephony → VoIP Calls**: every call with start/stop, state, and protocol. Select one and click **Flow Sequence** for a ladder diagram (SIP + RTP), or **Play Streams** to listen to the audio (G.711 is playable directly).
- **Telephony → SIP Flows** / **SIP Statistics**: counts by method/response code (e.g. "40% of INVITEs get 503").
- **Telephony → RTP → RTP Streams**: every stream with **lost packets, max delta, max/mean jitter**. Select a stream and click **Stream Analysis** for a per-packet jitter/delta graph.
- **Telephony → RTP → RTP Player**: hear exactly what the server heard, including gaps and robotic audio.

> **RTP not decoded?** If you captured without the SIP setup, Wireshark doesn't know those UDP ports are RTP. Use **Analyze → Enable Protocols → `rtp_udp`** (heuristic), or right-click → **Decode As… → RTP**.

### How to read a capture: a checklist
1. Find the call (**VoIP Calls**, or filter on the number/Call-ID).
2. Follow the signaling: INVITE → 100 → 180/183 → 200 → **ACK** → … → BYE. Where does it stop? Which side sent the error?
3. Check the **SDP in the INVITE and in the 200 OK**: `c=` IP (public or private?), `m=` port, common codec, `a=sendrecv`/`sendonly`, DTMF payload type.
4. Check **RTP actually flows in both directions** to the IP:port the SDP advertised. Two streams per call is normal (one each way).
5. For quality, check RTP Stream Analysis: loss %, jitter, delta spikes, sequence errors.
6. Compare captures from **both sides** (client and server). The difference shows where packets disappear (firewall, NAT, ISP).

---

## 3. Advanced: symptom → cause → fix playbook

| Symptom | What you'll see in the capture | Likely cause | Fix |
|---|---|---|---|
| **One-way audio** | RTP only in one direction; SDP `c=` has a private IP | NAT / wrong advertised IP / firewall blocking RTP inbound | Set external media IP, `rtp_symmetric`, `direct_media=no`, open the RTP range in SG/NACL/firewall, use rtpengine |
| **No audio both ways** | 200 OK + ACK fine, no RTP at all | RTP port range blocked; media sent to unreachable IPs | Open UDP RTP range; check SDP IPs; check NACL **ephemeral return** rules (NACLs are stateless) |
| **Call drops after ~32 s** | 200 OK retransmitted repeatedly, no ACK, then BYE | ACK lost: NAT, wrong `Contact`/`Record-Route`, TCP/UDP mismatch | Fix NAT handling (`fix_nated_contact`, `rewrite_contact`), correct Record-Route, disable SIP ALG |
| **Calls drop at fixed intervals (e.g. 15/30 min)** | re-INVITE/UPDATE for session timers fails, or BYE from a firewall | Session-timer negotiation, NAT/firewall UDP timeout | Align session timers, raise UDP timeouts, keepalives |
| **Choppy / robotic audio** | RTP stream analysis shows loss > 1% and high jitter | Congestion, Wi-Fi, CPU overload on the media server, no QoS | QoS/DSCP EF (46) for RTP, more bandwidth, fix CPU (avoid transcoding), check NIC/instance network limits |
| **Echo** | Audio itself is fine in the capture | Acoustic echo (speakerphone) or analog gateway hybrid | Echo cancellation on the device/gateway; usually not the network |
| **Delayed audio** | Large one-way delay in RTCP RTT | Long routing path, oversized jitter buffer | Closer region/POP, tune jitter buffer |
| **`488 Not Acceptable Here`** | Codec lists in SDP don't overlap | Codec mismatch | Align `allow=` lists or enable transcoding |
| **`403 Forbidden`** | Auth or IP rejection from carrier | Wrong creds, IP not whitelisted, bad caller-ID format | Fix creds/whitelist/number format (E.164) |
| **`408 Request Timeout` / `503`** | No response from next hop / overload / no route | Backend down, DNS SRV failure, trunk down, firewall | Check dispatcher state, trunk registration, DNS, SG rules |
| **`480` / `404`** | Callee not registered / unknown | Phone offline (NAT binding expired), dialplan error | Keepalives, shorter registration expiry, fix dialplan |
| **DTMF not detected** | No `telephone-event` packets, or wrong payload type | DTMF mode mismatch (RFC4733 vs INFO vs inband) | Align `dtmf_mode`; avoid inband with compressed codecs |
| **Registrations failing for everyone** | Flood of REGISTER, 401 loops, or timeouts | Server overload, DB backend slow, attack | Rate limit, scale, check DB, fail2ban/pike |
| **Calls work internally, fail externally** | External legs show private IPs | NAT config on the PBX | `external_*_address`, `local_net` |

### Customer-reported issue: how to run it end to end
1. **Gather facts**: caller/callee numbers, exact time (with timezone), direction (in/out), a sample Call-ID if possible, and how often it happens.
2. **Find the CDR** and the Call-ID, then search HOMER/logs by Call-ID across Kamailio, the media server, and rtpengine.
3. **Classify the problem**: signaling failure (response code), media failure (no or one-way RTP), or quality problem (loss/jitter/MOS).
4. **Narrow the domain**: customer network (Wi-Fi, SIP ALG, firewall), the internet path, our edge (SG/NACL/WAF/Kamailio), the media server, or the carrier. Compare captures at two points to locate the loss.
5. **Mitigate first** (failover trunk, reroute, drain a sick node), then root-cause.
6. **Document it**: update the runbook with the symptom, the evidence, the fix, and a prevention step (an alert or a config change).

### Load & regression testing
**SIPp** generates SIP/RTP call scenarios (`sipp -sn uac -r 10 -l 200 -m 1000 <target>` = 10 CPS, 200 concurrent, 1000 calls). Use it to verify capacity before releases and to reproduce bugs.
