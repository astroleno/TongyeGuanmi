"""Offline configuration fixtures, not production or browser qualification."""
import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('publication', Path(__file__).with_name('publish-experience-release.py'))
publication = importlib.util.module_from_spec(spec)
spec.loader.exec_module(publication)


class ProbeLuaPathTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix='tongye-probe-library-test-')
        self.addCleanup(self.directory.cleanup)
        self.config = Path(self.directory.name) / 'nginx.conf'

    def test_preserves_the_actual_production_library_order_without_modifying_it(self):
        value = '/www/server/nginx/lualib-security-20261022/?.lua;/www/server/nginx/lib/lua/?.lua;;'
        content = f'# lua_package_path "ignored";\nhttp {{\n  lua_package_path "{value}";\n}}\n'
        self.config.write_text(content)
        self.assertEqual(publication.production_lua_package_path(self.config), value)
        self.assertEqual(self.config.read_text(), content)

    def test_missing_or_ambiguous_paths_fail_closed(self):
        for content in ['', 'lua_package_path "/www/server/nginx/lib/lua/?.lua;;";\nlua_package_path "/www/server/nginx/other/?.lua;;";']:
            self.config.write_text(content)
            with self.assertRaises(ValueError): publication.production_lua_package_path(self.config)

    def test_unsafe_or_guessed_library_paths_are_not_inserted_into_the_probe(self):
        for value in ['/tmp/?.lua;;', '/www/server/nginx/../other/?.lua;;', '/www/server/nginx/lib/lua/?.lua;', '/www/server/nginx/lib/lua/?.lua;$bad;;']:
            self.config.write_text(f'lua_package_path "{value}";\n')
            with self.assertRaises(ValueError): publication.production_lua_package_path(self.config)


if __name__ == '__main__':
    unittest.main()
