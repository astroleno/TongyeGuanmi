# Tongye CDN certificate automation

These files mirror the certificate-only automation on the Alibaba origin host.
They do not deploy website code, change DNS, or alter COS objects.

- `tongye_cdn_cert_deploy.py` installs at `/usr/local/lib/tongye-cdn-cert/`.
- `tongye-cdn-cert-cron` installs at `/usr/local/sbin/` and runs daily at 04:17 Asia/Shanghai through the existing `/etc/cron.d/tongye-cdn-cert` entry.
- The existing Python wrapper uses `/opt/tongye-cdn-cert/venv/bin/python`.
- Credentials and private keys remain on the server, outside this repository.

The shared certificate covers only `assets.tongye.me` and `media.tongye.me`.
Renewal uses the existing acme.sh registration. A not-due result still runs CDN
reconciliation, and both domains must present the expected valid certificate.

CDN updates use `ModifyDomainConfig` with the exact route
`Https.CertInfo.CertId`. This preserves the other HTTPS fields and avoids SSL's
account-wide certificate replacement service role. All domain bindings are
checked before any write; unexpected domains/certificates fail closed. A partial
update can resume without reapplying the already-updated domain.

Run the credential-free safety tests locally:

```sh
python3 -m unittest discover -s ops/certificates -p 'test_*.py'
sh -n ops/certificates/tongye-cdn-cert-cron
```

After an explicitly authorized server installation, run
`sudo /usr/local/sbin/tongye-cdn-cert-cron`, then verify public TLS, a real image
request, and a video Range request. Do not force a fresh issuance if the installed
certificate is already valid. Keep a root-only backup of the installed scripts
before replacing them; never roll a working certificate back to an expired one.
