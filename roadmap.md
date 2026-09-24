# PÖTTYÖS RecipeFlow – roadmap

- [x] Local XLS/XLSX upload + header-based parsing, import template detection
- [x] Normalization (original / calculated / displayed), rounding rules, per 100 g / per product
- [x] Ingredient dictionary matching (Felismert / Ellenőrizendő / Ismeretlen) + resolve flow
- [x] Validation, traceability drawer, manual overrides, approval
- [x] Three documents + real DOCX export
- [x] Fix "home page not showing" (was a temporary reload while tools installed)
- [x] Inline field-by-field editing (edit types, dropdowns, Módosítva, restore, company/regulatory rules)
- [x] Multi-file product package (recipe + specs + references), local PDF/DOCX/XLS extraction, linking, conflicts, unknown data, quality params, regulatory review
- [x] Legacy .doc: local converter hook (127.0.0.1) + offline converter service; fallback marked "! Régi Word formátum – ellenőrzés szükséges"
- [x] Three master templates (GYL, Késztermék spec, Szövegterv) from reference Word structure, template map, cross-document check
- [ ] UI to create document-specific overrides (+ approval)
- [x] Template-based Word export: GYL_MASTER, SPEC_MASTER, LEGAL_TEXT_MASTER built from the original files, filled with current data
- [ ] Historical field-mapping suggestions (admin accept/modify/reject)
- [ ] Version comparison (changed values only)
- [ ] Historical example library + Szabályjavaslat
- [ ] Editable dictionary/rules/template forms, product-specific exceptions
- [x] IndexedDB storage (products, decisions, audit, original files) + Beállítások ADATTÁROLÁS status
- [x] Every issue has a fix button; smart navigation (scroll, highlight, open field); step counters; VISSZA/TOVÁBB with blocking list
- [x] Vitest + Testing Library (npm run test / test:run), unit + UI tests
- [ ] Offline PWA packaging
- [ ] Full-page UI tests for upload/export screens (covered by manual browser run for now)

## Final hardening pass
- [x] Offline master templates (IndexedDB, versioned) — verified offline export of all three
- [x] Hard-fail historical leak test (hashed denylist) + exact placeholder tests; builder exits on leak
- [x] Orphaned blob deletion (removed file, deleted product, demo reset, start-up purge)
- [x] Recipe values reopen stored recipe file
- [x] Tartós tárhely status + warning; HELYI BIZTONSÁGI MENTÉS / VISSZAÁLLÍTÁS
- [x] Partly read .doc blocks approval until authorized manual review
- [x] CI workflow (lint, test:run, build)
- [ ] Open generated files in Microsoft Word (user) ; full manual E2E with real PDF/DOCX/DOC files (user)
- [ ] Offline start of the app itself needs PWA packaging (still open)
