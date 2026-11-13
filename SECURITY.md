# Security policy

## Supported versions

Only the latest release on `main` is supported.

## Reporting a vulnerability

Please report privately through GitHub's **Report a vulnerability** button on the repository's *Security* tab. Do not open a public issue. We aim to reply within 7 days.

## Credentials

TerraPulse needs a NASA Earthdata token only to download data. It is read from `.env` (git-ignored) or, in the Colab notebook, typed into a hidden prompt; it is never written to outputs, logs or the notebook. A test (`tests/test_notebook.py`) fails if a token-like string appears in the committed notebook. The published web app needs no credentials and sends none.

If you find a credential committed anywhere in the history, report it as above so it can be revoked.
