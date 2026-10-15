#!/usr/bin/env python3
"""Upload and safely roll forward the Tongye CDN certificate.

This program never performs the first CDN binding.  The first certificate is
only staged in Tencent SSL Certificate Manager.  Once a human binds it to both
CDN domains and confirms it publicly, --confirm-initial marks it active.
Thereafter renew/reconcile update only DOMAINS, preserving all other CDN settings.
"""

from __future__ import annotations

import argparse
import fcntl
import hashlib
import json
import logging
import os
import socket
import ssl
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DOMAINS = ("assets.tongye.me", "media.tongye.me")
SECRETS_FILE = Path(os.environ.get("TONGYE_CDN_SECRETS_FILE", "/etc/tongye-cdn-cert/secrets.env"))
LIVE_DIR = Path(os.environ.get("TONGYE_CDN_LIVE_DIR", "/etc/tongye-cdn-cert/live"))
FULLCHAIN_FILE = LIVE_DIR / "fullchain.pem"
KEY_FILE = LIVE_DIR / "privkey.pem"
STATE_FILE = Path(os.environ.get("TONGYE_CDN_STATE_FILE", "/var/lib/tongye-cdn-cert/state.json"))
LOCK_FILE = Path("/run/tongye-cdn-cert-deploy.lock")
POLL_SECONDS = 15
POLL_ATTEMPTS = 40


class DeploymentError(RuntimeError):
    """A recoverable certificate deployment failure."""


def configure_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        stream=sys.stdout,
    )


def read_secret_file(path: Path) -> dict[str, str]:
    required = {
        "Ali_Key",
        "Ali_Secret",
        "TENCENTCLOUD_SECRET_ID",
        "TENCENTCLOUD_SECRET_KEY",
    }
    values: dict[str, str] = {}
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError as exc:
        raise DeploymentError(f"cannot read secrets file: {exc}") from exc

    for raw_line in lines:
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if key not in required:
            continue
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
            value = value[1:-1]
        if value:
            values[key] = value

    missing = sorted(required - values.keys())
    if missing:
        raise DeploymentError(f"missing required secret variables: {', '.join(missing)}")
    return values


def read_state() -> dict[str, Any]:
    if not STATE_FILE.exists():
        return {}
    try:
        return json.loads(STATE_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise DeploymentError(f"cannot read state file: {exc}") from exc


def write_state(state: dict[str, Any]) -> None:
    STATE_FILE.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    payload = json.dumps(state, sort_keys=True, indent=2) + "\n"
    with tempfile.NamedTemporaryFile(
        mode="w",
        encoding="utf-8",
        dir=STATE_FILE.parent,
        prefix=".state.",
        delete=False,
    ) as handle:
        handle.write(payload)
        handle.flush()
        os.fsync(handle.fileno())
        temporary = Path(handle.name)
    temporary.chmod(0o600)
    temporary.replace(STATE_FILE)
    STATE_FILE.chmod(0o600)


def certificate_metadata() -> dict[str, str]:
    if not FULLCHAIN_FILE.is_file() or not KEY_FILE.is_file():
        raise DeploymentError("installed certificate files are missing")

    try:
        san = subprocess.run(
            ["openssl", "x509", "-in", str(FULLCHAIN_FILE), "-noout", "-ext", "subjectAltName"],
            check=True,
            capture_output=True,
            text=True,
        ).stdout
        fingerprint = subprocess.run(
            ["openssl", "x509", "-in", str(FULLCHAIN_FILE), "-noout", "-fingerprint", "-sha256"],
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip().split("=", 1)[1].replace(":", "").lower()
        serial = subprocess.run(
            ["openssl", "x509", "-in", str(FULLCHAIN_FILE), "-noout", "-serial"],
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip().split("=", 1)[1]
        not_after = subprocess.run(
            ["openssl", "x509", "-in", str(FULLCHAIN_FILE), "-noout", "-enddate"],
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip().split("=", 1)[1]
    except (subprocess.CalledProcessError, IndexError) as exc:
        raise DeploymentError("certificate metadata could not be parsed") from exc

    validity = subprocess.run(
        ["openssl", "x509", "-in", str(FULLCHAIN_FILE), "-checkend", "86400", "-noout"],
        capture_output=True,
    )
    if validity.returncode:
        raise DeploymentError("local certificate is expired or expires within 24 hours")
    missing = [domain for domain in DOMAINS if f"DNS:{domain}" not in san]
    if missing:
        raise DeploymentError(f"certificate SAN does not cover: {', '.join(missing)}")

    return {
        "fingerprint_sha256": fingerprint,
        "serial": serial,
        "not_after": not_after,
        "fullchain_sha256": hashlib.sha256(FULLCHAIN_FILE.read_bytes()).hexdigest(),
    }


def live_fingerprint(domain: str) -> str:
    context = ssl.create_default_context()
    with socket.create_connection((domain, 443), timeout=10) as connection:
        with context.wrap_socket(connection, server_hostname=domain) as tls:
            certificate = tls.getpeercert(binary_form=True)
    return hashlib.sha256(certificate).hexdigest()


def live_certificate_matches(expected_fingerprint: str) -> tuple[bool, list[str]]:
    failed: list[str] = []
    for domain in DOMAINS:
        try:
            actual = live_fingerprint(domain)
        except OSError as exc:
            failed.append(f"{domain}: TLS connection failed ({exc})")
            continue
        if actual != expected_fingerprint:
            failed.append(f"{domain}: certificate fingerprint has not propagated")
    return not failed, failed


def ssl_client_from_secrets(secrets: dict[str, str]) -> Any:
    try:
        from tencentcloud.common import credential
        from tencentcloud.ssl.v20191205 import ssl_client
    except ImportError as exc:
        raise DeploymentError("Tencent Cloud Python SDK is not installed") from exc

    cred = credential.Credential(
        secrets["TENCENTCLOUD_SECRET_ID"],
        secrets["TENCENTCLOUD_SECRET_KEY"],
    )
    return ssl_client.SslClient(cred, "")


def upload_certificate(client: Any, metadata: dict[str, str]) -> tuple[str, str]:
    try:
        from tencentcloud.ssl.v20191205 import models
    except ImportError as exc:
        raise DeploymentError("Tencent Cloud Python SDK is not installed") from exc

    request = models.UploadCertificateRequest()
    request.CertificatePublicKey = FULLCHAIN_FILE.read_text(encoding="utf-8")
    request.CertificatePrivateKey = KEY_FILE.read_text(encoding="utf-8")
    request.CertificateType = "SVR"
    request.CertificateUse = "CDN"
    request.Repeatable = False
    request.Alias = (
        "tongye-cdn-letsencrypt-"
        + datetime.now(timezone.utc).strftime("%Y%m%d")
        + "-"
        + metadata["fingerprint_sha256"][:12]
    )

    response = client.UploadCertificate(request)
    certificate_id = response.CertificateId or response.RepeatCertId
    if not certificate_id:
        raise DeploymentError("Tencent SSL upload returned no certificate ID")
    return certificate_id, response.RequestId


def stage_current_certificate(state: dict[str, Any], secrets: dict[str, str]) -> tuple[dict[str, Any], dict[str, str], str]:
    metadata = certificate_metadata()
    if (
        state.get("active_fingerprint_sha256") == metadata["fingerprint_sha256"]
        and state.get("active_certificate_id")
    ):
        logging.info("certificate already active in CDN state; no upload needed")
        return state, metadata, str(state["active_certificate_id"])

    if (
        state.get("pending_fingerprint_sha256") == metadata["fingerprint_sha256"]
        and state.get("pending_certificate_id")
    ):
        logging.info("certificate is already staged in Tencent SSL")
        return state, metadata, str(state["pending_certificate_id"])

    client = ssl_client_from_secrets(secrets)
    certificate_id, request_id = upload_certificate(client, metadata)
    state.update(
        {
            "pending_certificate_id": certificate_id,
            "pending_fingerprint_sha256": metadata["fingerprint_sha256"],
            "pending_serial": metadata["serial"],
            "pending_not_after": metadata["not_after"],
            "pending_uploaded_at": datetime.now(timezone.utc).isoformat(),
            "pending_upload_request_id": request_id,
        }
    )
    write_state(state)
    logging.info(
        "staged Tencent certificate id=%s serial=%s expires=%s request_id=%s",
        certificate_id,
        metadata["serial"],
        metadata["not_after"],
        request_id,
    )
    return state, metadata, certificate_id


def cdn_client_from_secrets(secrets: dict[str, str]) -> Any:
    from tencentcloud.common import credential
    from tencentcloud.cdn.v20180606 import cdn_client

    cred = credential.Credential(
        secrets["TENCENTCLOUD_SECRET_ID"], secrets["TENCENTCLOUD_SECRET_KEY"]
    )
    return cdn_client.CdnClient(cred, "")


def trigger_cdn_update(
    client: Any,
    old_certificate_id: str,
    new_certificate_id: str,
) -> str:
    # Direct, domain-scoped updates do not require SSL's account-wide
    # replacement service role. Never replace the entire Https object:
    # omitted nested fields would reset unrelated TLS settings to defaults.
    from tencentcloud.cdn.v20180606 import models

    request = models.DescribeDomainsConfigRequest()
    request.from_json_string(json.dumps({
        "Filters": [{"Name": "domain", "Value": list(DOMAINS), "Fuzzy": False}],
        "Limit": len(DOMAINS),
    }))
    domains = client.DescribeDomainsConfig(request).Domains
    if len(domains) != len(DOMAINS) or {row.Domain for row in domains} != set(DOMAINS):
        raise DeploymentError("CDN inventory does not match the two authorized domains")
    for row in domains:
        if (not row.Https or row.Https.Switch != "on" or not row.Https.CertInfo
                or row.Https.CertInfo.CertId not in {old_certificate_id, new_certificate_id}):
            raise DeploymentError(f"{row.Domain}: unexpected HTTPS certificate; refusing update")

    requests = []
    for row in domains:
        if row.Https.CertInfo.CertId == new_certificate_id:
            logging.info("%s already references the renewed certificate", row.Domain)
            continue
        update = models.ModifyDomainConfigRequest()
        update.Domain = row.Domain
        update.Route = "Https.CertInfo.CertId"
        update.Value = json.dumps({"update": new_certificate_id})
        result = client.ModifyDomainConfig(update)
        requests.append(result.RequestId)
        logging.info("updated CDN certificate domain=%s old=%s new=%s request_id=%s",
                     row.Domain, old_certificate_id, new_certificate_id, result.RequestId)
    return ",".join(requests)


def wait_for_cdn(expected_fingerprint: str) -> None:
    for attempt in range(1, POLL_ATTEMPTS + 1):
        matches, failures = live_certificate_matches(expected_fingerprint)
        if matches:
            logging.info("both CDN domains now serve the renewed certificate")
            return
        logging.info(
            "waiting for CDN propagation attempt=%d/%d details=%s",
            attempt,
            POLL_ATTEMPTS,
            "; ".join(failures),
        )
        time.sleep(POLL_SECONDS)
    raise DeploymentError("CDN did not present the staged certificate before timeout")


def promote_pending(state: dict[str, Any]) -> None:
    pending_id = state.get("pending_certificate_id")
    pending_fingerprint = state.get("pending_fingerprint_sha256")
    if not pending_id or not pending_fingerprint:
        raise DeploymentError("there is no staged certificate to promote")
    matches, failures = live_certificate_matches(str(pending_fingerprint))
    if not matches:
        raise DeploymentError("CDN certificate is not ready: " + "; ".join(failures))

    state.update(
        {
            "active_certificate_id": pending_id,
            "active_fingerprint_sha256": pending_fingerprint,
            "active_serial": state.get("pending_serial"),
            "active_not_after": state.get("pending_not_after"),
            "active_promoted_at": datetime.now(timezone.utc).isoformat(),
        }
    )
    for key in list(state):
        if key.startswith("pending_"):
            state.pop(key)
    write_state(state)
    logging.info("confirmed initial CDN binding for certificate id=%s", pending_id)


def renew_or_reconcile(state: dict[str, Any], secrets: dict[str, str]) -> None:
    active_id = state.get("active_certificate_id")
    if not active_id:
        logging.info("no active certificate ID yet; first CDN binding remains human-gated")
        return

    state, metadata, new_id = stage_current_certificate(state, secrets)
    if state.get("active_fingerprint_sha256") == metadata["fingerprint_sha256"]:
        matches, failures = live_certificate_matches(metadata["fingerprint_sha256"])
        if not matches:
            raise DeploymentError("active CDN certificate health check failed: " + "; ".join(failures))
        logging.info("both CDN domains still serve the active certificate")
        return

    client = cdn_client_from_secrets(secrets)
    request_id = trigger_cdn_update(client, str(active_id), new_id)
    wait_for_cdn(metadata["fingerprint_sha256"])
    state.update(
        {
            "active_certificate_id": new_id,
            "active_fingerprint_sha256": metadata["fingerprint_sha256"],
            "active_serial": metadata["serial"],
            "active_not_after": metadata["not_after"],
            "active_promoted_at": datetime.now(timezone.utc).isoformat(),
            "last_cdn_update_request_id": request_id,
        }
    )
    for key in list(state):
        if key.startswith("pending_"):
            state.pop(key)
    write_state(state)
    logging.info("renewed CDN certificate has been confirmed and promoted")


def status(state: dict[str, Any]) -> None:
    active = state.get("active_certificate_id", "none")
    pending = state.get("pending_certificate_id", "none")
    print(f"active_certificate_id={active}")
    print(f"pending_certificate_id={pending}")
    print(f"active_not_after={state.get('active_not_after', 'none')}")
    print(f"pending_not_after={state.get('pending_not_after', 'none')}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "mode",
        choices=("stage", "confirm-initial", "renew", "reconcile", "status", "validate-local"),
    )
    args = parser.parse_args()
    configure_logging()

    LOCK_FILE.touch(mode=0o600, exist_ok=True)
    with LOCK_FILE.open("r+") as lock:
        try:
            fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            logging.info("another certificate deployment is already running; exiting")
            return 0

        state = read_state()
        if args.mode == "status":
            status(state)
            return 0
        if args.mode == "validate-local":
            metadata = certificate_metadata()
            logging.info(
                "local certificate valid serial=%s expires=%s fingerprint=%s",
                metadata["serial"],
                metadata["not_after"],
                metadata["fingerprint_sha256"],
            )
            return 0

        secrets = read_secret_file(SECRETS_FILE)
        if args.mode == "stage":
            stage_current_certificate(state, secrets)
            return 0
        if args.mode == "confirm-initial":
            promote_pending(state)
            return 0
        renew_or_reconcile(state, secrets)
        return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except DeploymentError as exc:
        logging.error("%s", exc)
        raise SystemExit(1)
    except Exception:
        logging.exception("unexpected certificate automation failure")
        raise SystemExit(1)
