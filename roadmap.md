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
- [ ] Offline PWA packaging, IndexedDB storage
