# Vision OCR fixtures

These project-owned PNGs provide deterministic Python, Java, and TypeScript error screens for PocketPilot's on-device OCR evaluation. The set includes clear terminal text, low contrast, and a seven-degree camera-angle simulation.

Run `./generate-fixtures.ps1` from PowerShell to regenerate them. `expected-tokens.json` is the manual/native-device scoring key; a token counts when OCR returns it case-insensitively after whitespace normalization. Mock-provider unit tests do not claim image OCR accuracy.
