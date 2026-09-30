# Public static content. Included inside the tongye.me HTTPS server only.
location = /robots.txt {
    types { } default_type text/plain;
    add_header Cache-Control "no-cache";
    try_files $uri =404;
}
location = /sitemap.xml {
    types { } default_type application/xml;
    add_header Cache-Control "no-cache";
    try_files $uri =404;
}
location = /llms.txt {
    types { } default_type text/plain;
    add_header Cache-Control "no-cache";
    try_files $uri =404;
}
location = /og-image.webp {
    add_header Cache-Control "no-cache";
    try_files $uri =404;
}
location = /services { return 301 /services/$is_args$args; }
location = /faq { return 301 /faq/$is_args$args; }
location = /services/index.html { return 301 /services/$is_args$args; }
location = /faq/index.html { return 301 /faq/$is_args$args; }
location = /services/ {
    add_header Cache-Control "no-cache";
    add_header X-Robots-Tag $tongye_preview_robots always;
    try_files /services/index.html =404;
}
location = /faq/ {
    add_header Cache-Control "no-cache";
    add_header X-Robots-Tag $tongye_preview_robots always;
    try_files /faq/index.html =404;
}
location = /brand-lab {
    add_header X-Robots-Tag "noindex, nofollow" always;
    add_header Cache-Control "no-cache";
    try_files /index.html =404;
}
location ^~ /harness/ { return 404; }
location ^~ /audit/ { return 404; }
error_page 404 /404.html;
location = /404.html {
    internal;
    add_header X-Robots-Tag "noindex" always;
    add_header Cache-Control "no-store" always;
}
