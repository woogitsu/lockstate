# Source art intake

This directory holds the original, user-supplied art sheets. They are deliberately separate from runtime atlases and are tracked with Git LFS.

## Intake rules

- Do not load these sheets directly in Phaser.
- Preserve the original PNG unchanged for reproducibility and future re-cropping.
- A runtime asset must be generated from a versioned extraction manifest with explicit IDs, source rectangles, pivot, logical footprint and layer.
- Source sheets are not evidence that every depicted view is an approved production sprite. The asset pipeline selects and normalizes specific views.

## Current batch

The owner supplied 23 transparent 32-bit PNG sheets on 2026-08-22. Every sheet is 1448×1086 px. The filenames are stable source IDs and their listed variants remain unprocessed pending the atlas pipeline in Issue #32.
