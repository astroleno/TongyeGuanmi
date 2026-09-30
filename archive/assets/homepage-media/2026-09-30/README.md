# Phone image source

The original Figure2 phone foreground arch is preserved byte-for-byte here before
creating its 1008 × 1792 display derivative. Source SHA-256:
`fdf7cc96d69a0e886493c07c29958bd1be2d2ae107405295313740fc862a94b5`.

Rebuild the four phone images with `node app/scripts/rebuild-phone-images.mjs`.
The three other sources remain unchanged desktop masters in `assets/`.
All derivatives preserve aspect ratio and use WebP Q90 / alpha Q100.
