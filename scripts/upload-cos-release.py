#!/usr/bin/env python3

import argparse
import json
import os
from pathlib import Path

from qcloud_cos import CosConfig, CosS3Client
from qcloud_cos.cos_exception import CosServiceError


def required_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"{name} is required")
    return value


def headers_lower(response: dict) -> dict[str, str]:
    return {str(key).lower(): str(value) for key, value in response.items()}


def object_exists(client: CosS3Client, bucket: str, key: str) -> dict | None:
    try:
        return client.head_object(Bucket=bucket, Key=key)
    except CosServiceError as error:
        if error.get_status_code() == 404 or error.get_error_code() in {
            "NoSuchKey",
            "NoSuchResource",
        }:
            return None
        raise


def verify_head(response: dict, entry: dict) -> None:
    headers = headers_lower(response)
    expected = {
        "content-length": str(entry["bytes"]),
        "content-type": entry["contentType"],
        "cache-control": entry["cacheControl"],
        "x-cos-meta-sha256": entry["sha256"],
    }
    for name, value in expected.items():
        actual = headers.get(name, "")
        if actual != value:
            raise RuntimeError(
                f"{entry['objectKey']} returned {name}={actual!r}, expected {value!r}"
            )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("package_root", type=Path)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    package_root = args.package_root.resolve()
    manifest_path = package_root / "release-deploy-manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("schemaVersion") != 1:
        raise RuntimeError("unsupported release deploy manifest schema")

    secret_id = required_env("TENCENTCLOUD_SECRET_ID")
    secret_key = required_env("TENCENTCLOUD_SECRET_KEY")
    token = os.environ.get("TENCENTCLOUD_SESSION_TOKEN", "").strip() or None
    buckets = {
        "assets": required_env("TONGYE_ASSETS_COS_BUCKET"),
        "media": required_env("TONGYE_MEDIA_COS_BUCKET"),
    }
    regions = {
        "assets": os.environ.get("TONGYE_ASSETS_COS_REGION", "ap-shanghai").strip(),
        "media": os.environ.get(
            "TONGYE_MEDIA_COS_REGION",
            os.environ.get("TONGYE_ASSETS_COS_REGION", "ap-shanghai"),
        ).strip(),
    }
    clients: dict[str, CosS3Client] = {}

    def client_for(channel: str) -> CosS3Client:
        region = regions[channel]
        if region not in clients:
            clients[region] = CosS3Client(
                CosConfig(
                    Region=region,
                    SecretId=secret_id,
                    SecretKey=secret_key,
                    Token=token,
                    Scheme="https",
                )
            )
        return clients[region]

    uploaded = 0
    skipped = 0
    for entry in manifest["cdnFiles"]:
        channel = entry["channel"]
        bucket = buckets[channel]
        client = client_for(channel)
        source = package_root / entry["packagePath"]
        if source.stat().st_size != entry["bytes"]:
            raise RuntimeError(f"local size mismatch for {source}")

        existing = object_exists(client, bucket, entry["objectKey"])
        if existing is not None:
            verify_head(existing, entry)
            skipped += 1
            print(f"SKIP {channel} {entry['objectKey']}")
            continue
        if args.dry_run:
            print(f"DRY-RUN {channel} {entry['objectKey']}")
            continue

        with source.open("rb") as body:
            client.put_object(
                Bucket=bucket,
                Key=entry["objectKey"],
                Body=body,
                EnableMD5=True,
                ContentType=entry["contentType"],
                CacheControl=entry["cacheControl"],
                Metadata={"x-cos-meta-sha256": entry["sha256"]},
            )
        verify_head(client.head_object(Bucket=bucket, Key=entry["objectKey"]), entry)
        uploaded += 1
        print(f"UPLOAD {channel} {entry['objectKey']}")

    print(
        json.dumps(
            {
                "releaseId": manifest["releaseId"],
                "fileCount": manifest["cdnFileCount"],
                "uploaded": uploaded,
                "skipped": skipped,
                "dryRun": args.dry_run,
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
