import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('prepare_seo', Path(__file__).with_name('prepare-seo-nginx.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class RoutingMigrationTests(unittest.TestCase):
    def setUp(self):
        self.source = '''server {
    server_name tongye.me;
    root $tongye_site_root;
    location = /__preview/example/ { return 302 https://tongye.me/; }
    location = /index.html {
        add_header X-Robots-Tag $tongye_preview_robots always;
        try_files $uri =404;
    }
    location / { try_files $uri $uri/ /index.html; }
}'''

    def test_preserves_preview_and_only_replaces_known_routing(self):
        actual = module.prepare(self.source)
        self.assertIn('root $tongye_site_root;', actual)
        self.assertIn('location = /__preview/example/ { return 302 https://tongye.me/; }', actual)
        self.assertIn('add_header X-Robots-Tag $tongye_preview_robots always;', actual)
        self.assertIn('try_files $uri $uri/ =404;', actual)
        self.assertEqual(actual.count(module.INCLUDE), 1)
        self.assertNotIn('set $tongye_preview_robots', actual)
        self.assertEqual(module.prepare(actual), actual)

    def test_unknown_fallback_is_rejected_without_writing(self):
        with self.assertRaises(ValueError):
            module.prepare(self.source.replace('/index.html;', '@custom;'))

    def test_standalone_vhost_gets_preview_default(self):
        source = self.source.replace('        add_header X-Robots-Tag $tongye_preview_robots always;\n', '')
        self.assertIn('set $tongye_preview_robots "";', module.prepare(source))


if __name__ == '__main__':
    unittest.main()
