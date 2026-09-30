#!/usr/bin/env bash
set -euo pipefail

release_id=${1:?release id required}
staging=${2:?staging directory required}
[[ "$release_id" =~ ^[a-z0-9][a-z0-9._-]{2,79}$ ]]
[[ "$staging" == "/tmp/tongye-release-$release_id" ]]
site_root=/www/wwwroot/tongye.me
release_root="$site_root/releases/$release_id"
vhost=/www/server/panel/vhost/nginx/html_tongye.me.conf
routes=/www/server/panel/vhost/nginx/tongye-seo-routes.inc

rollback() {
    cp "$staging/previous-nginx.conf" "$vhost"
    if test -f "$staging/previous-seo-routes.inc"; then
        cp "$staging/previous-seo-routes.inc" "$routes"
    else
        rm -f "$routes"
    fi
    previous=$(cat "$staging/previous-release.txt")
    if test -n "$previous" && test -d "$previous"; then
        ln -sfn "$previous" "$site_root/.current-rollback"
        mv -Tf "$site_root/.current-rollback" "$site_root/current"
    else
        rm -f "$site_root/current"
    fi
    nginx -t
    systemctl reload nginx
}

if [[ "${3:-}" == --rollback ]]; then
    rollback
    exit 0
fi

test ! -e "$release_root"
install -d -m 755 "$release_root.staging"
rsync -a --delete "$staging/site/" "$release_root.staging/"
chown -R www:www "$release_root.staging"
mv "$release_root.staging" "$release_root"
readlink -f "$site_root/current" > "$staging/previous-release.txt" || :
cp "$vhost" "$staging/previous-nginx.conf"
if test -f "$routes"; then cp "$routes" "$staging/previous-seo-routes.inc"; fi
python3 "$staging/prepare-seo-nginx.py" "$vhost" "$staging/candidate-nginx.conf"

# Any configuration, switch, or reload failure restores both routing and site.
trap rollback EXIT
install -m 644 "$staging/tongye-seo-routes.inc" "$routes"
install -m 644 "$staging/candidate-nginx.conf" "$vhost"
nginx -t
ln -sfn "$release_root" "$site_root/.current-$release_id"
mv -Tf "$site_root/.current-$release_id" "$site_root/current"
systemctl reload nginx
trap - EXIT
