# CivicSignal: a community issue map

CivicSignal is a Snap Map-style experience for issues people face with public infrastructure and governance. The map is the product's starting point. A report is a place-based signal with a photo, voice note, text, or a combination of those formats.

## Core journey

1. Open the map and explore issues around a place.
2. Tap a signal to see photos, listen to a voice note, and read the context and review history.
3. Drop a pin or use device location to report an issue.
4. Add photos, record/upload audio, or write what happened. A short title can be generated when media is supplied.
5. Post the signal and return to the map. Shared reports become visible to other visitors.

The current categories include water, roads, power, health, education, sanitation, public transport, public spaces, and governance. Governance includes service-access problems, administrative delays, and other issues with public institutions. Reports are community submissions, not verified findings or official government responses.

## Design priorities

- Put the interactive map before summary metrics and analytics.
- Make reporting easy on a phone, including for someone who prefers speaking to typing.
- Show the kind of evidence available on report pins and in the list.
- Keep public issue locations separate from a person's live location. Device location is used only after an explicit request; the app does not track people continuously.
- Keep reports persistent until removed; “Snap Map-style” describes the spatial browsing experience, not automatic expiry or a Snapchat integration.
- Preserve author control, reviewer permissions, and visible status history.

## Implemented pilot

- Map-first responsive layout, map-area filtering, and fit-to-signals control.
- Up to three compressed photos and one audio attachment per report.
- Microphone recording with a 60-second limit and audio file upload.
- Photo/audio viewing and playback in report details; text-only reporting remains available.
- Governance and the wider public-infrastructure categories.
- Local media persistence in IndexedDB and a Supabase Storage integration for shared mode.

## Later product decisions

Clustering for dense maps, community corroboration, multilingual transcription, routing to responsible departments, and stronger abuse/moderation tools are natural next steps. These are not implemented or advertised as working features. Video, private messaging, and live person tracking are outside this pilot's scope.
