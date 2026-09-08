# iQOO / vivo Office Kit research

Research date: 2026-09-08

## Decision

**C. PRODUCT FEATURE EXISTS BUT NO VERIFIED DEVELOPER API**

Official vivo and iQOO material confirms that Office Kit is a cross-device productivity feature. The reviewed official material describes screen mirroring, phone/PC file transfer, notes or task handoff, clipboard-style collaboration, and remote-PC use on supported products. It does not publish an Office Kit developer SDK, callable API, intent contract, authentication specification, or third-party integration guide. No hackathon-only SDK or organizer-supplied Office Kit documentation is present in this repository or the supplied milestone material.

PocketPilot therefore does **not** claim to use Office Kit. `OfficeKitBridge` remains an explicit `NOT_IMPLEMENTED` boundary. The working product uses its independently verified authenticated HTTP/WebSocket bridge over the local network.

## Sources reviewed

### vivo Office Kit product page

- **Title:** vivo Office Kit — phone, tablet, and computer connectivity
- **Official source:** [pc.vivo.com](https://pc.vivo.com/)
- **What it says:** Office Kit provides multi-device collaboration, including screen mirroring, file transfer, clipboard-style sharing, notes continuity, and remote PC on supported devices.
- **Developer access:** No developer enrollment or third-party integration path is described.
- **API availability:** No public API or SDK is documented on the reviewed page.
- **Authentication:** Consumer sign-in and device pairing are product concerns; no developer authentication contract is published.
- **Platform restrictions:** Feature availability varies by device and function. The page provides Windows and macOS clients and identifies model-specific restrictions for some capabilities.
- **Hackathon relevance:** It validates the product category and the value of phone-to-laptop continuity, but not an integration mechanism PocketPilot can truthfully implement.

### OriginOS 6 Office Kit description

- **Title:** OriginOS 6 — Office Kit
- **Official source:** [vivo OriginOS 6](https://www.vivo.com/my/originos)
- **What it says:** Office Kit connects a phone with Windows or Mac for cross-screen interaction, transfer, screen mirroring, and task handoff.
- **Developer access:** No third-party developer access is offered on the reviewed page.
- **API availability:** No callable interface, SDK artifact, schema, or intent list is published.
- **Authentication:** Not documented as a developer-facing protocol.
- **Platform restrictions:** The official footnotes say availability depends on selected models, applications, regions, and software rollout; PC support requires compatible Windows or macOS systems.
- **Hackathon relevance:** Strong official evidence that the feature exists, but insufficient evidence for an application integration claim.

### iQOO product Office Kit description

- **Title:** iQOO Z11 Lite product page, Office Kit features
- **Official source:** [iQOO product site](https://www.iqoo.com/in/products/z11-Lite-44w)
- **What it says:** The product page presents screen mirroring, cross-device file transfer, and notes synchronization as Office Kit capabilities.
- **Developer access:** No developer registration or extension surface is stated.
- **API availability:** No public Office Kit API or SDK is linked.
- **Authentication:** The consumer feature may use an iQOO account, but there is no published third-party authentication flow.
- **Platform restrictions:** The page explicitly says the 4 GB RAM edition does not support Office Kit. Support must not be generalized to all iQOO devices or configurations.
- **Hackathon relevance:** Confirms iQOO product relevance while reinforcing that product functionality is not equivalent to developer access.

### vivo developer platform

- **Title:** vivo Open Platform
- **Official source:** [dev.vivo.com.cn](https://dev.vivo.com.cn/home)
- **What it says:** vivo provides developer services for published platform capabilities.
- **Developer access:** Available for the capabilities documented by that platform.
- **API availability:** Searches of the official developer domain did not locate an Office Kit SDK/API, PC-bridge API, or Office Kit intent contract.
- **Authentication:** No Office Kit-specific developer authentication material was found.
- **Platform restrictions:** Individual vivo developer capabilities have their own requirements; none can be assumed to grant Office Kit access.
- **Hackathon relevance:** This was the expected authoritative location for public developer access. Its lack of discoverable Office Kit documentation prevents an A classification.

### vivo Quick App API reference

- **Title:** vivo Quick App API reference
- **Official source:** [qapp-chimera.vivo.com.cn](https://qapp-chimera.vivo.com.cn/api/index.html)
- **What it says:** Documents Quick App capabilities including networking, WebSocket, files, Bluetooth, and Wi-Fi.
- **Developer access:** Available within the Quick App platform and its permission model.
- **API availability:** These are Quick App APIs, not an Office Kit extension or PC-integration SDK.
- **Authentication:** Capability-specific permissions and platform rules apply.
- **Platform restrictions:** Quick App runtime only; it is not evidence that an Expo/React Native app may invoke Office Kit.
- **Hackathon relevance:** Useful evidence that vivo publishes developer APIs when available, but it does not justify mapping unrelated Quick App APIs to Office Kit.

## Classification rationale

- **Not A:** No public verified developer API for Office Kit was found.
- **Not B:** No organizer-supplied hackathon SDK/API or access material was supplied or found.
- **C:** Official product pages clearly confirm the consumer feature, while developer access is unverified.
- **Not D:** There is sufficient official documentation to verify that Office Kit exists as a product feature.

## Product action

1. Keep `LocalWebSocketBridge` as the verified production/demo transport.
2. Keep `OfficeKitBridge` explicitly unavailable; do not simulate or silently alias it to the LAN bridge.
3. Use this exact forward-looking statement in submissions: “PocketPilot's bridge architecture is designed so verified iQOO cross-device APIs can replace or complement its authenticated LAN transport when developer access is available.”
4. Do not say “PocketPilot uses Office Kit,” “Office Kit integration complete,” or “official iQOO API” unless official developer documentation and a physical integration test become available.

## Revisit criteria

Reclassify only if vivo/iQOO or hackathon organizers provide all of the following: an official SDK/API artifact, supported-device and OS matrix, authentication/permission requirements, third-party usage terms, and a test path. Any implementation must then pass a physical supported-device test before being described as integrated.
