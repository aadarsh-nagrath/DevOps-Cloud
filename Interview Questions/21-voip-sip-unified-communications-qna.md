# VoIP, SIP & Unified Communications — Interview Questions & Answers

> Part of the [Interview Questions](./README.md) hub. Deep-dive notes: [`VoIP and Unified Communications/`](../VoIP%20and%20Unified%20Communications) ([SIP fundamentals](../VoIP%20and%20Unified%20Communications/voip-sip-fundamentals.md), [Asterisk/FreeSWITCH/Kamailio](../VoIP%20and%20Unified%20Communications/asterisk-freeswitch-kamailio.md), [Wireshark troubleshooting](../VoIP%20and%20Unified%20Communications/voip-troubleshooting-wireshark.md), [VoIP on AWS & K8s](../VoIP%20and%20Unified%20Communications/voip-on-aws-and-kubernetes.md)). Grouped **Junior → Mid → Senior**.

---

## Table of Contents
- [Junior Level (0–2 yrs)](#junior-level-02-yrs)
- [Mid Level (2–5 yrs)](#mid-level-25-yrs)
- [Senior Level (5+ yrs)](#senior-level-5-yrs)

---

## Junior Level (0–2 yrs)

### 1. What is SIP, and what is RTP? Why do we need both?
**SIP** is the signaling protocol: it sets up, modifies, and ends calls (who is calling whom, where to reach them, which codecs to use). It runs on port 5060 (UDP/TCP), or 5061 for TLS. **RTP** carries the actual audio and video as UDP packets, usually on a large port range (Asterisk 10000–20000 by default). They're separate because signaling is small, infrequent, and needs reliability, while media is a continuous, latency-sensitive stream. The practical consequence is that they travel on different ports and often different paths, so a call can be set up correctly and still have no audio.

### 2. Walk through a basic SIP call flow.
The caller sends `INVITE` with an SDP offer (its IP, port, and codecs). The proxy/PBX answers `100 Trying` and forwards it. The callee's phone rings and sends `180 Ringing`. When answered it sends `200 OK` with its SDP answer, and the caller confirms with `ACK`. RTP then flows both ways to the IP:port each side advertised. Either side ends the call with `BYE`, answered by `200 OK`. If the caller gives up before answer, it sends `CANCEL`, and the callee replies `487 Request Terminated`.

### 3. Name common SIP response codes and what they usually mean operationally.
`100/180/183` are progress (183 often carries early media such as carrier ringback). `200 OK` is success. `401/407` are normal digest auth challenges. `403` means rejected: wrong credentials or IP not whitelisted. `404` means unknown number or user. `408` means no response from the next hop. `480` means the user isn't registered. `486` means busy. `487` means the request was cancelled. `488` means codec or SDP mismatch. `503` means overloaded, no route, or trunk down. `603` means declined. Watching the *ratio* of these codes is one of the best health signals for a voice platform.

### 4. What do Asterisk, FreeSWITCH, and Kamailio each do?
**Asterisk** is an IP-PBX and B2BUA: extensions, dialplan, IVR, voicemail, queues, and it handles media. **FreeSWITCH** is a softswitch and B2BUA known for high concurrency, conferencing, and transcoding, programmable via ESL; it also handles media. **Kamailio** is a high-performance SIP proxy, registrar, and load balancer that handles **signaling only** at very high calls-per-second. It's typically paired with rtpengine for media and used as the secure front door in front of Asterisk/FreeSWITCH pools.

### 5. What is a codec? Name a few.
A codec encodes and compresses audio for transport. Common ones: **G.711** μ-law/A-law (64 kbps, uncompressed, best quality, about 87 kbps on the wire), **G.729** (8 kbps, low bandwidth), **G.722** (wideband "HD voice"), and **Opus** (adaptive, loss-resilient, the WebRTC default). Both sides must share a codec or the call fails with `488`. Converting between codecs (transcoding) costs CPU on the media server.

### 6. What is a SIP trunk and a DID?
A **SIP trunk** is a SIP connection between your platform and a carrier/ITSP that carries calls to and from the PSTN, authenticated by credentials and/or IP whitelisting. A **DID** is a real phone number the carrier routes to your trunk so it can ring a specific extension, IVR, or queue.

### 7. What metrics define voice quality?
**Latency** (one-way under 150 ms), **jitter** (under 30 ms), **packet loss** (under 1%), and the resulting **MOS** score (1–5, with 4.0+ considered good). At the call level, operators track **ASR** (answer-seizure ratio), **ACD** (average call duration), and **PDD** (post-dial delay).

---

## Mid Level (2–5 yrs)

### 8. A customer reports one-way audio. How do you troubleshoot?
One-way audio is almost always a **media path problem, not a signaling one**, and usually NAT or a firewall. Steps: take a capture (`tcpdump` on the server, or HOMER) and check the SDP in both the INVITE and the 200 OK. Is the `c=` line advertising a **private IP**? Is the port inside the open RTP range? Then confirm RTP is flowing in both directions in Wireshark (*Telephony → RTP → RTP Streams*). Typical fixes: configure the PBX's external/public address (`external_media_address` in Asterisk PJSIP, `ext-rtp-ip` in FreeSWITCH), enable symmetric RTP/`rport`, set `direct_media=no` so media is anchored through the server, open the RTP UDP range in Security Groups **and NACLs** (NACLs are stateless, so outbound needs a rule too), disable **SIP ALG** on the customer's router, or put rtpengine in the media path.

### 9. Calls drop after exactly ~30–32 seconds. Why?
The callee sent `200 OK` but never received the `ACK`, so it keeps retransmitting the 200 OK and gives up after 64×T1 (about 32 seconds), then tears the call down. The ACK is getting lost, usually because the `Contact` header has a private IP (NAT), `Record-Route` is wrong so the ACK goes to the wrong hop, there's a UDP/TCP transport mismatch, or a SIP ALG mangled the headers. A capture showing repeated 200 OKs with no ACK confirms it. Fix the NAT handling (`fix_nated_contact()` in Kamailio, `rewrite_contact=yes` in Asterisk) or the routing headers.

### 10. How do you use Wireshark to analyze a VoIP call?
Capture with `tcpdump -i any -s 0 -w call.pcap port 5060 or portrange 10000-20000`. In Wireshark, *Telephony → VoIP Calls* lists calls; select one and open **Flow Sequence** for the SIP and RTP ladder diagram. Filter by `sip.Call-ID == "..."` or `sip.Status-Code >= 400` for failures. *Telephony → RTP → RTP Streams → Stream Analysis* shows packet loss, jitter, and delta, and the **RTP Player** lets you listen to the audio. If RTP isn't decoded, enable the `rtp_udp` heuristic or use *Decode As → RTP*. For quick live work on a server, **sngrep** gives the same ladder view in the terminal.

### 11. Choppy or robotic audio: what's your approach?
That points to **packet loss or jitter**, not a configuration error. Use RTP stream analysis to quantify loss and jitter and find where it starts (compare captures at the client and the server to see which network segment loses packets). Common causes: congested last-mile or Wi-Fi on the customer side, no QoS (RTP should be marked **DSCP EF/46**), media server CPU saturation from transcoding, conferencing, or recording, cloud instance PPS/bandwidth limits, or cross-region media paths. Fixes range from QoS and bandwidth, through avoiding transcoding and scaling out media servers, to using a closer region or POP and tuning jitter buffers.

### 12. How does NAT break SIP, and what are the fixes?
SIP and SDP carry IP addresses **in the message body** (Via, Contact, SDP `c=`), and NAT only rewrites packet headers. The far end therefore tries to send signaling or media to unreachable private addresses, and NAT bindings expire, so inbound calls stop reaching registered phones. Fixes: server-side public-address configuration, symmetric RTP and `rport`, Kamailio `nathelper` with **rtpengine** as a media relay, client-side **STUN/TURN/ICE** (mandatory in WebRTC), keepalives (OPTIONS/CRLF, short registration expiry), and disabling SIP ALG on routers.

### 13. What's the role of rtpengine?
rtpengine is a high-performance (kernel-forwarding) RTP media proxy controlled by Kamailio/OpenSIPS. It anchors media on a public IP to solve NAT, bridges **SRTP⇄RTP** and **WebRTC⇄SIP**, can record calls, and reports per-call quality stats. Because Kamailio doesn't touch media, rtpengine is how a Kamailio-based edge handles media problems.

### 14. How do you monitor the health of a VoIP platform?
Monitor at three layers:
- **Availability**: SIP `OPTIONS` pings to every proxy, media server, and trunk (Kamailio dispatcher probing, blackbox probes), and registration counts.
- **Traffic health**: CPS, active calls, response code ratios (spikes in 503/408/488), ASR/ACD from CDRs, and trunk registration state.
- **Quality**: RTCP/rtpengine stats for MOS, jitter, and loss.

The tooling is HOMER for SIP capture and search by Call-ID; Prometheus exporters (Kamailio `xhttp_prom`, rtpengine metrics, Asterisk/FreeSWITCH exporters) with Grafana dashboards; and centralized logs that include the Call-ID. Alerts should fire on symptoms users feel (ASR drop, 5xx ratio, MOS drop) plus fraud signals like spikes in auth failures or international call volume.

### 15. How do you secure a SIP platform exposed to the internet?
Expect constant scanning (`friendly-scanner`/SIPVicious) and **toll-fraud** attempts. Controls: no direct exposure of PBXs (put Kamailio or an SBC in front), Security Groups restricting SIP to carrier/customer ranges where possible, strong unique SIP passwords, **fail2ban** on auth failures, Kamailio `pike` and `ratelimit`, IP ACLs on trunks, dial-plan restrictions on premium and international destinations, per-account concurrency and spend limits, **TLS + SRTP** for encryption, management ports (AMI 5038, ESL 8021, SSH) reachable only via VPN/bastion, and timely patching. In the US, add STIR/SHAKEN for caller ID.

---

## Senior Level (5+ yrs)

### 16. Design a highly available, scalable VoIP platform on AWS.
- **Edge**: Route 53 (SRV/A records, health-check failover, latency-based routing) pointing to **Kamailio** nodes with **Elastic IPs** in multiple AZs (or an **NLB** for SIP with client IP preservation). Kamailio does auth, rate limiting, NAT fixing, and `dispatcher` load balancing with OPTIONS health probes.
- **Media**: **rtpengine** nodes with public IPs; a pool of **Asterisk/FreeSWITCH** media servers in an ASG across AZs, with lifecycle hooks for call draining.
- **Data**: RDS for subscribers, dispatcher lists, and CDRs; Redis for shared state; Kamailio `DMQ` to replicate registrations; recordings in **S3** with lifecycle rules and encryption.
- **Network**: SGs for SIP from trusted ranges and RTP open; NACLs mirroring that in both directions; management only via SSM/VPN; WAF in front of the web portals and APIs (not SIP).
- **Ops**: HOMER plus Prometheus/Grafana; configuration in Git, deployed via Ansible or Helm/Argo CD; SIPp load tests in CI; runbooks for trunk failover and node drain.
- **Capacity**: sized on concurrent calls, CPS, transcoding CPU, and PPS/bandwidth (about 87 kbps per G.711 leg per direction).
- **Multi-carrier**: at least two carriers with LCR/failover routing.

### 17. How would you run Kamailio/rtpengine/Asterisk on Kubernetes (EKS), and what are the pitfalls?
The pitfalls are that RTP needs thousands of UDP ports and stable public IPs advertised in SDP, kube-proxy SNAT hides the client IP, and rolling updates drop live calls. Patterns that work: a **dedicated node group** (taints/tolerations, nodeSelector) with public IPs, and **`hostNetwork: true`** for rtpengine/Kamailio/media pods (DaemonSet or anti-affinity). Each pod discovers the node's public IP from instance metadata. Configs go in **ConfigMaps**, credentials in Secrets, everything packaged as **Helm charts** and deployed via **Argo CD**. Use `preStop` hooks that remove the node from the dispatcher and wait for active calls to reach zero, with a long `terminationGracePeriodSeconds`, plus **PDBs**. Scale with HPA/KEDA on **active calls or CPS metrics** rather than CPU, scale down slowly, and protect nodes with active calls from scale-in. Readiness = "answers SIP OPTIONS"; keep liveness conservative. Many teams keep media on VMs (EC2) and only containerize the stateless signaling and API layers. That's a valid answer if you justify it.

### 18. How do you safely deploy a new version of the media servers or Kamailio config in production?
Treat it like any other production release, but **call-aware**. Validate first (`kamailio -c` syntax check, config in Git with PR review, a SIPp regression suite in staging). Then do a canary through the dispatcher: add the new-version node with a low weight, watch ASR, the 5xx ratio, MOS, and CPU, then increase the weight. Or use blue-green: bring up a new pool, flip the dispatcher/DNS, and **drain** the old pool, never hard-killing it, because calls last a long time. Prefer reloads (`kamcmd dispatcher.reload`, `dialplan reload`, `reloadxml`) over restarts. Schedule risky changes in low-traffic windows, notify support, and keep a one-command rollback (previous Helm release or Argo CD rollback, or the previous dispatcher set).

### 19. You're on call and ASR drops from 55% to 20% for outbound calls. Walk through your incident response.
1. **Triage scope**: all outbound calls or one carrier? One region/node? Started when? Did anything change (deploy, config, carrier notice)?
2. Check **response code distribution**: a jump in 503/408 to one carrier suggests the trunk is down or rate-limited; 403 suggests an auth or IP-whitelist change; 488 suggests a codec change from a deploy; 404 suggests a number-format or dialplan regression.
3. Check trunk registration and OPTIONS state, dispatcher state, and recent deploys or config commits.
4. **Mitigate first**: reroute to a secondary carrier (LCR failover), roll back the last change, or drain a bad node.
5. Communicate status to support and customers.
6. Root-cause with captures (Call-IDs from HOMER) and open a carrier ticket with evidence.
7. Afterwards: a blameless postmortem, an alert on ASR per carrier if it was missing, automated carrier failover, and a runbook update.

### 20. How do you protect against a toll-fraud attack in progress?
Detect it through alerts on auth-failure spikes, unusual international or premium destinations, after-hours call volume, or concurrent calls per account above baseline. To contain it immediately: block the offending source IPs (fail2ban/htable/SG), disable the compromised account or trunk, apply emergency dial restrictions for international and premium prefixes, and cap concurrency. Ask the carrier to block destinations if needed. Then rotate credentials, review CDRs to quantify the damage, and harden: strong passwords, IP-bound accounts, per-account spend and concurrency limits, geo restrictions, and pike/ratelimit tuning. Document it as a security incident.
